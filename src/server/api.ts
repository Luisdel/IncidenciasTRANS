import express, { Request, Response, RequestHandler } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import * as dns from 'node:dns/promises';
import { execFileSync } from 'node:child_process';
import { db, initDatabase, getDatabaseStats, createNotification } from './db.ts';

// Initialize DB schema on load
initDatabase();

export const apiRouter = express.Router();

// Parse json bodies with limit for compressed images
apiRouter.use(express.json({ limit: '8mb' }));

// ==========================================
// SESSION & CLIENT MACHINE HELPERS
// ==========================================

export type AppRole = 'user' | 'admin' | 'superadmin';

export interface SessionRecord {
  id: number;
  token: string;
  username: string;
  role: string;
  ip: string | null;
  mac: string | null;
  hostname: string | null;
  windows_user: string | null;
  windows_domain: string | null;
  user_agent: string | null;
  client_source: string;
  created_at: string;
  last_seen_at: string;
}

export function isAdminRole(role: string | undefined | null): boolean {
  return role === 'admin' || role === 'superadmin';
}

function getClientIp(req: Request): string {
  const raw = req.socket?.remoteAddress || req.ip || '';
  return String(raw).replace(/^::ffff:/, '');
}

function readClientMac(ip: string): string | null {
  if (!ip) return null;
  try {
    if (process.platform === 'linux') {
      const arp = fs.readFileSync('/proc/net/arp', 'utf8');
      for (const line of arp.split('\n').slice(1)) {
        const parts = line.trim().split(/\s+/);
        if (parts[0] === ip && parts[3] && parts[3] !== '*' && parts[3] !== '00:00:00:00:00:00') {
          return parts[3].toLowerCase();
        }
      }
    }
    const command = process.platform === 'win32' ? 'arp' : 'ip';
    const args = process.platform === 'win32' ? ['-a', ip] : ['neigh', 'show', ip];
    const output = execFileSync(command, args, { encoding: 'utf8', timeout: 1500 });
    const match = output.match(/([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i);
    return match ? match[0].replace(/-/g, ':').toLowerCase() : null;
  } catch {
    return null;
  }
}

async function reverseDnsHostname(ip: string): Promise<string | null> {
  if (!ip || ip.startsWith('127.') || ip === '::1') return null;
  try {
    const names = await Promise.race([
      dns.reverse(ip),
      new Promise<string[]>((_, reject) => setTimeout(() => reject(new Error('dns timeout')), 1200)),
    ]);
    return names[0] || null;
  } catch {
    return null;
  }
}

function getSession(req: Request): SessionRecord | null {
  const token = req.header('x-session-token');
  if (!token) return null;

  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token) as SessionRecord | undefined;
  if (!session) return null;

  try {
    db.prepare('UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').run(session.id);
  } catch {
    // Dont let telemetry break the request
  }
  return session;
}

function requireRoles(...roles: AppRole[]): RequestHandler {
  return (req, res, next) => {
    const session = getSession(req);
    if (!session) {
      res.status(401).json({ error: 'Sesion no valida o caducada. Vuelve a iniciar sesion.' });
      return;
    }
    if (!roles.includes(session.role as AppRole)) {
      res.status(403).json({ error: 'No tienes permisos para realizar esta accion.' });
      return;
    }
    (req as any).session = session;
    next();
  };
}

function getMachineByIp(ip: string): any | null {
  if (!ip) return null;
  return (db.prepare(
    'SELECT * FROM client_machines WHERE ip = ? ORDER BY last_seen_at DESC, id DESC LIMIT 1'
  ).get(ip) as any) || null;
}

function createSession(user: { username: string; role: string }, req: Request, ip: string): { token: string; session: SessionRecord } {
  const token = crypto.randomBytes(24).toString('hex');
  const machine = getMachineByIp(ip);
  const mac = machine?.mac || readClientMac(ip);

  db.prepare(`
    INSERT INTO sessions (token, username, role, ip, mac, hostname, windows_user, windows_domain, user_agent, client_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    token,
    user.username,
    user.role,
    ip,
    mac || null,
    machine?.hostname || null,
    machine?.windows_user || null,
    machine?.windows_domain || null,
    req.get('user-agent') || null,
    machine ? 'agent' : 'server'
  );

  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token) as unknown as SessionRecord;
  return { token, session };
}

function enrichSessionsForMachine(machine: any) {
  if (!machine?.ip) return;
  try {
    db.prepare(`
      UPDATE sessions
      SET mac = COALESCE(?, mac),
          hostname = COALESCE(?, hostname),
          windows_user = COALESCE(?, windows_user),
          windows_domain = COALESCE(?, windows_domain),
          client_source = 'agent',
          last_seen_at = CURRENT_TIMESTAMP
      WHERE ip = ?
    `).run(
      machine.mac || null,
      machine.hostname || null,
      machine.windows_user || null,
      machine.windows_domain || null,
      machine.ip
    );
  } catch {
    // Enrichment is best-effort
  }
}

function lookupHostnameInBackground(ip: string, sessionId: number) {
  void reverseDnsHostname(ip).then((hostname) => {
    if (!hostname) return;
    try {
      db.prepare('UPDATE sessions SET hostname = COALESCE(hostname, ?) WHERE id = ?').run(hostname, sessionId);
    } catch {
      // ignore
    }
  });
}

// Health / Status check
apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    server: 'IncidenciasTRANS',
    client: 'ClienteINCIDENCIAS',
    timestamp: new Date().toISOString(),
  });
});

// Database & Server Diagnostic stats
apiRouter.get('/server/stats', (_req: Request, res: Response) => {
  try {
    const stats = getDatabaseStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al obtener estadisticas' });
  }
});

// User simple login (no password). If the username does not exist yet it is
// created automatically as an active standard user, using the name and
// department sent by the login form.
apiRouter.post('/auth/user-login', (req: Request, res: Response) => {
  const { username, fullName, department } = req.body || {};
  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'El nombre de usuario es obligatorio' });
  }

  const cleanUsername = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,50}$/.test(cleanUsername)) {
    return res.status(400).json({
      error: 'El identificador debe tener entre 2 y 50 caracteres y solo puede contener letras, números, punto, guion o guion bajo.',
    });
  }

  try {
    let user = db.prepare(`
      SELECT id, username, role, full_name, department, is_active
      FROM users
      WHERE username = ?
    `).get(cleanUsername) as any;

    if (!user) {
      const cleanFullName = typeof fullName === 'string' && fullName.trim()
        ? fullName.trim().slice(0, 120)
        : cleanUsername;
      const cleanDepartment = typeof department === 'string' && department.trim()
        ? department.trim().slice(0, 120)
        : 'General';

      const result = db.prepare(`
        INSERT INTO users (username, role, password_hash, full_name, department, is_active)
        VALUES (?, 'user', NULL, ?, ?, 1)
      `).run(cleanUsername, cleanFullName, cleanDepartment);

      user = db.prepare(`
        SELECT id, username, role, full_name, department, is_active
        FROM users
        WHERE id = ?
      `).get(Number(result.lastInsertRowid)) as any;
    }

    // Admin/superadmin accounts must use the password-protected admin tab.
    if (isAdminRole(user.role)) {
      return res.status(403).json({
        error: 'Las cuentas de administrador deben acceder desde la pestaña Administrador con su contraseña.',
      });
    }

    if (user.is_active === 0) {
      return res.status(403).json({
        error: `El usuario '@${cleanUsername}' está desactivado temporalmente. Contacte con un administrador.`,
      });
    }

    const ip = getClientIp(req);
    const { token, session } = createSession(user, req, ip);
    lookupHostnameInBackground(ip, session.id);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        department: user.department,
        is_active: user.is_active,
      },
      token,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error en inicio de sesion de usuario' });
  }
});

// Admin login (with password)
apiRouter.post('/auth/admin-login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contrasena requeridos' });
  }

  try {
    const cleanUsername = username.trim().toLowerCase();
    const user = db.prepare(`
      SELECT id, username, role, password_hash, full_name, department, is_active 
      FROM users 
      WHERE username = ?
    `).get(cleanUsername) as any;

    if (!user || !isAdminRole(user.role)) {
      return res.status(401).json({ error: 'Credenciales de administrador invalidas' });
    }

    if (user.is_active === 0) {
      return res.status(403).json({ error: 'Esta cuenta de administrador esta inactiva' });
    }

    const hashedInput = crypto.createHash('sha256').update(password).digest('hex');
    if (user.password_hash !== hashedInput) {
      return res.status(401).json({ error: 'Contrasena incorrecta' });
    }

    const ip = getClientIp(req);
    const { token, session } = createSession(user, req, ip);
    lookupHostnameInBackground(ip, session.id);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        department: user.department,
      },
      token,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error en autenticacion de admin' });
  }
});

// ==========================================
// SESSIONS & CLIENT MACHINES
// ==========================================

// List recent sessions (admin/superadmin only). Tokens are never exposed.
apiRouter.get('/sessions', requireRoles('admin', 'superadmin'), (_req: Request, res: Response) => {
  try {
    const sessions = db.prepare(`
      SELECT id, username, role, ip, mac, hostname, windows_user, windows_domain,
             user_agent, client_source, created_at, last_seen_at
      FROM sessions
      ORDER BY last_seen_at DESC, id DESC
      LIMIT 200
    `).all();
    res.json(sessions);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al listar sesiones' });
  }
});

// List registered client machines (admin/superadmin only).
apiRouter.get('/client-machines', requireRoles('admin', 'superadmin'), (_req: Request, res: Response) => {
  try {
    const machines = db.prepare(`
      SELECT id, hostname, ip, mac, windows_user, windows_domain, os, source, created_at, last_seen_at
      FROM client_machines
      ORDER BY last_seen_at DESC, id DESC
      LIMIT 500
    `).all();
    res.json(machines);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al listar equipos' });
  }
});

// Agent registration endpoint. The PowerShell agent posts the machine data
// here. It is intentionally open inside the LAN, like the rest of the app.
apiRouter.post('/client-machines', (req: Request, res: Response) => {
  const body = req.body || {};
  const clean = (value: unknown, max = 200): string | null => {
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
  };

  const ip = clean(body.ip) || getClientIp(req) || null;
  const hostname = clean(body.hostname);
  const rawMac = clean(body.mac);
  const mac = rawMac ? rawMac.toLowerCase().replace(/-/g, ':') : null;
  const windowsUser = clean(body.windows_user);
  const windowsDomain = clean(body.windows_domain);
  const osName = clean(body.os);

  if (!ip && !hostname && !mac) {
    return res.status(400).json({ error: 'Se requiere al menos IP, MAC o nombre de equipo' });
  }

  try {
    let existing = null as any;
    if (mac) {
      existing = db.prepare('SELECT * FROM client_machines WHERE mac = ? LIMIT 1').get(mac);
    }
    if (!existing && hostname) {
      existing = db.prepare('SELECT * FROM client_machines WHERE hostname = ? LIMIT 1').get(hostname);
    }
    if (!existing && ip) {
      existing = db.prepare(
        'SELECT * FROM client_machines WHERE ip = ? ORDER BY last_seen_at DESC, id DESC LIMIT 1'
      ).get(ip);
    }

    let machineId: number;
    if (existing) {
      db.prepare(`
        UPDATE client_machines
        SET hostname = COALESCE(?, hostname),
            ip = COALESCE(?, ip),
            mac = COALESCE(?, mac),
            windows_user = COALESCE(?, windows_user),
            windows_domain = COALESCE(?, windows_domain),
            os = COALESCE(?, os),
            last_seen_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(hostname, ip, mac, windowsUser, windowsDomain, osName, existing.id);
      machineId = existing.id;
    } else {
      const result = db.prepare(`
        INSERT INTO client_machines (hostname, ip, mac, windows_user, windows_domain, os)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(hostname, ip, mac, windowsUser, windowsDomain, osName);
      machineId = Number(result.lastInsertRowid);
    }

    const machine = db.prepare('SELECT * FROM client_machines WHERE id = ?').get(machineId) as any;
    enrichSessionsForMachine(machine);

    // Enrich already-created incidents that belong to this same client IP.
    try {
      db.prepare(`
        UPDATE incidents
        SET client_mac = COALESCE(?, client_mac),
            client_hostname = COALESCE(?, client_hostname),
            client_windows_user = COALESCE(?, client_windows_user),
            client_windows_domain = COALESCE(?, client_windows_domain)
        WHERE client_ip = ?
      `).run(
        machine.mac || null,
        machine.hostname || null,
        machine.windows_user || null,
        machine.windows_domain || null,
        machine.ip || null
      );
    } catch {
      // Best-effort enrichment
    }

    res.json({ success: true, machine });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al registrar equipo' });
  }
});

// Downloadable PowerShell agent. It reports the Windows machine data and can
// optionally install itself as an ONLOGON scheduled task.
apiRouter.get('/client-agent.ps1', (req: Request, res: Response) => {
  const baseUrl = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/'/g, "''");
  const script = `# IncidenciasTRANS - Agente de datos del equipo
# Uso puntual:
#   powershell -ExecutionPolicy Bypass -File .\\IncidenciasTRANS-Agent.ps1
# Instalar para que se ejecute al iniciar sesion:
#   powershell -ExecutionPolicy Bypass -File .\\IncidenciasTRANS-Agent.ps1 -Install
param([switch]$Install)

$ErrorActionPreference = 'SilentlyContinue'
$Server = '${baseUrl}'

function Send-MachineInfo {
  $cfg = Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled -and $_.DefaultIPGateway } | Select-Object -First 1
  if (-not $cfg) {
    $cfg = Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled } | Select-Object -First 1
  }
  $ip = ($cfg.IPAddress | Where-Object { $_ -match '^\\d{1,3}(\\.\\d{1,3}){3}$' } | Select-Object -First 1)
  $mac = $cfg.MACAddress
  $os = (Get-CimInstance Win32_OperatingSystem).Caption
  $body = @{
    hostname = $env:COMPUTERNAME
    ip = $ip
    mac = $mac
    windows_user = $env:USERNAME
    windows_domain = $env:USERDOMAIN
    os = $os
  } | ConvertTo-Json -Compress
  try {
    Invoke-RestMethod -Method Post -Uri "$Server/api/client-machines" -ContentType 'application/json' -Body $body | Out-Null
    Write-Host "[IncidenciasTRANS] Equipo registrado: $env:COMPUTERNAME ($ip)"
  } catch {
    Write-Host "[IncidenciasTRANS] No se pudo registrar el equipo: $($_.Exception.Message)"
  }
}

Send-MachineInfo

if ($Install) {
  $dir = Join-Path $env:LOCALAPPDATA 'IncidenciasTRANS'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $target = Join-Path $dir 'agent.ps1'
  Copy-Item -LiteralPath $PSCommandPath -Destination $target -Force
  $action = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $target + '"'
  schtasks /Create /SC ONLOGON /TN "IncidenciasTRANS-Agent" /TR $action /RL LIMITED /F | Out-Null
  Write-Host "[IncidenciasTRANS] Agente instalado para ejecutarse al iniciar sesion."
}
`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="IncidenciasTRANS-Agent.ps1"');
  res.send(script);
});

// ==========================================
// SUPERADMIN DATABASE WIPE
// ==========================================

apiRouter.post('/admin/wipe/incidents', requireRoles('superadmin'), (req: Request, res: Response) => {
  const { confirmation } = req.body || {};
  if (confirmation !== 'BORRAR') {
    return res.status(400).json({ error: 'Escribe BORRAR para confirmar el borrado.' });
  }

  try {
    const counts = {
      incidents: (db.prepare('SELECT COUNT(*) as c FROM incidents').get() as any).c,
      messages: (db.prepare('SELECT COUNT(*) as c FROM messages').get() as any).c,
      attachments: (db.prepare('SELECT COUNT(*) as c FROM attachments').get() as any).c,
      notifications: (db.prepare('SELECT COUNT(*) as c FROM notifications').get() as any).c,
    };

    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM attachments').run();
      db.prepare('DELETE FROM messages').run();
      db.prepare('DELETE FROM notifications').run();
      db.prepare('DELETE FROM incidents').run();
      try {
        db.exec("DELETE FROM sqlite_sequence WHERE name IN ('incidents','messages','attachments','notifications')");
      } catch {
        // optional
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    res.json({
      success: true,
      message: 'Incidencias, mensajes, adjuntos y notificaciones eliminados.',
      deleted: counts,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al vaciar incidencias' });
  }
});

apiRouter.post('/admin/wipe/users', requireRoles('superadmin'), (req: Request, res: Response) => {
  const { confirmation, deleteIncidents = true } = req.body || {};
  if (confirmation !== 'BORRAR') {
    return res.status(400).json({ error: 'Escribe BORRAR para confirmar el borrado.' });
  }

  const session = (req as any).session as SessionRecord;

  try {
    const deletedUsers = db.prepare('DELETE FROM users WHERE username <> ?').run(session.username).changes;

    // Invalidate every other user's session, including the deleted users.
    db.prepare('DELETE FROM sessions WHERE username <> ?').run(session.username);

    let deletedIncidents = 0;
    if (deleteIncidents) {
      deletedIncidents = (db.prepare('SELECT COUNT(*) as c FROM incidents').get() as any).c;
      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM attachments').run();
        db.prepare('DELETE FROM messages').run();
        db.prepare('DELETE FROM notifications').run();
        db.prepare('DELETE FROM incidents').run();
        try {
          db.exec("DELETE FROM sqlite_sequence WHERE name IN ('incidents','messages','attachments','notifications')");
        } catch {
          // optional
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    } else {
      db.prepare('DELETE FROM notifications WHERE recipient_username <> ?').run(session.username);
    }

    res.json({
      success: true,
      message: deleteIncidents
        ? 'Usuarios e incidencias eliminados. Se conserva la cuenta superadmin.'
        : 'Usuarios eliminados. Se conserva la cuenta superadmin.',
      deleted: { users: deletedUsers, incidents: deletedIncidents },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al vaciar usuarios' });
  }
});

// ==========================================
// USER MANAGEMENT (Admin Only)
// ==========================================

// List all users.
apiRouter.get('/users', requireRoles('admin', 'superadmin'), (_req: Request, res: Response) => {
  try {
    const users = db.prepare(`
      SELECT 
        u.id,
        u.username,
        u.role,
        u.full_name,
        u.department,
        u.is_active,
        u.created_at,
        (SELECT COUNT(*) FROM incidents i WHERE i.creator_username = u.username) as incident_count
      FROM users u
      ORDER BY CASE u.role WHEN 'superadmin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.created_at ASC
    `).all() as any[];

    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al listar usuarios' });
  }
});

// Create new user or admin.
apiRouter.post('/users', requireRoles('admin', 'superadmin'), (req: Request, res: Response) => {
  const { username, role = 'user', full_name, department, password } = req.body;

  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'El nombre de usuario es obligatorio' });
  }

  const cleanUsername = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,50}$/.test(cleanUsername)) {
    return res.status(400).json({
      error: 'El identificador debe tener entre 2 y 50 caracteres y solo puede contener letras, números, punto, guion o guion bajo.',
    });
  }

  const targetRole = role === 'admin' ? 'admin' : 'user';

  if (targetRole === 'admin' && (!password || password.trim().length < 4)) {
    return res.status(400).json({ error: 'Para crear un administrador se requiere contraseña (mínimo 4 caracteres)' });
  }

  try {
    // Check if user already exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
    if (existing) {
      return res.status(409).json({ error: `El usuario '@${cleanUsername}' ya existe en el sistema` });
    }

    let passwordHash: string | null = null;
    if (targetRole === 'admin' && password) {
      passwordHash = crypto.createHash('sha256').update(password.trim()).digest('hex');
    }

    const insert = db.prepare(`
      INSERT INTO users (username, role, password_hash, full_name, department, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);

    const result = insert.run(
      cleanUsername,
      targetRole,
      passwordHash,
      full_name?.trim() || cleanUsername,
      department?.trim() || 'General'
    );

    res.status(201).json({
      success: true,
      user: {
        id: Number(result.lastInsertRowid),
        username: cleanUsername,
        role: targetRole,
        full_name: full_name?.trim() || cleanUsername,
        department: department?.trim() || 'General',
        is_active: 1,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al crear usuario' });
  }
});

// Update user
apiRouter.patch('/users/:id', requireRoles('admin', 'superadmin'), (req: Request, res: Response) => {
  const { id } = req.params;
  const { full_name, department, role, password, is_active } = req.body;
  const requester = (req as any).session as SessionRecord;

  try {
    const user = db.prepare('SELECT id, username, role, password_hash, is_active FROM users WHERE id = ?').get(id) as any;
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Only a superadmin can touch the superadmin account.
    if (user.role === 'superadmin' && requester.role !== 'superadmin') {
      return res.status(403).json({ error: 'Solo un superadmin puede modificar la cuenta superadmin' });
    }

    const requestedRole = role === 'admin' ? 'admin' : role === 'user' ? 'user' : undefined;
    const targetRole = requestedRole !== undefined ? requestedRole : user.role;

    if (user.role === 'superadmin') {
      if (targetRole !== 'superadmin') {
        return res.status(400).json({ error: 'No se puede degradar la cuenta superadmin' });
      }
      if (is_active !== undefined && !is_active) {
        return res.status(400).json({ error: 'No se puede desactivar la cuenta superadmin' });
      }
    }

    let targetPasswordHash = user.password_hash;
    if (password && String(password).trim()) {
      targetPasswordHash = crypto.createHash('sha256').update(String(password).trim()).digest('hex');
    }

    // If is_active is not provided, preserve the current value instead of
    // silently reactivating the account.
    const targetActive = is_active !== undefined ? (is_active ? 1 : 0) : (user.is_active ?? 1);

    db.prepare(`
      UPDATE users 
      SET full_name = COALESCE(?, full_name),
          department = COALESCE(?, department),
          role = ?,
          password_hash = ?,
          is_active = ?
      WHERE id = ?
    `).run(
      full_name !== undefined ? String(full_name).trim() : null,
      department !== undefined ? String(department).trim() : null,
      targetRole,
      targetPasswordHash,
      targetActive,
      id
    );

    res.json({ success: true, message: 'Usuario actualizado correctamente' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al actualizar usuario' });
  }
});

// Delete user
apiRouter.delete('/users/:id', requireRoles('admin', 'superadmin'), (req: Request, res: Response) => {
  const { id } = req.params;
  const requester = (req as any).session as SessionRecord;

  try {
    const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(id) as any;
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // The superadmin account is protected: it can never be deleted, so the
    // system always keeps a user able to perform database maintenance.
    if (user.role === 'superadmin') {
      return res.status(400).json({ error: 'No se puede eliminar la cuenta superadmin' });
    }

    if (user.username === requester.username) {
      return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
    }

    // Invalidate any open session of the deleted user.
    db.prepare('DELETE FROM sessions WHERE username = ?').run(user.username);
    db.prepare('DELETE FROM notifications WHERE recipient_username = ?').run(user.username);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ success: true, message: `Usuario @${user.username} eliminado` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al eliminar usuario' });
  }
});

// ==========================================
// NOTIFICATIONS
// ==========================================

// Get notifications for current user/admin
apiRouter.get('/notifications', (req: Request, res: Response) => {
  const { username, role } = req.query;

  if (!username) {
    return res.status(400).json({ error: 'Nombre de usuario requerido' });
  }

  try {
    const cleanUsername = String(username).trim().toLowerCase();
    const isAdmin = isAdminRole(String(role));

    let notifs: any[];
    if (isAdmin) {
      // Admins receive notifications directed to 'ADMINS' or their specific username
      notifs = db.prepare(`
        SELECT * FROM notifications 
        WHERE recipient_username = 'ADMINS' OR recipient_username = ?
        ORDER BY created_at DESC 
        LIMIT 40
      `).all(cleanUsername) as any[];
    } else {
      // Users only receive notifications directed to their specific username
      notifs = db.prepare(`
        SELECT * FROM notifications 
        WHERE recipient_username = ?
        ORDER BY created_at DESC 
        LIMIT 40
      `).all(cleanUsername) as any[];
    }

    const unreadCount = notifs.filter(n => n.is_read === 0).length;

    res.json({ notifications: notifs, unreadCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al obtener notificaciones' });
  }
});

// Mark single notification as read
apiRouter.patch('/notifications/:id/read', (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al marcar notificacion' });
  }
});

// Mark all as read for user or admin
apiRouter.patch('/notifications/mark-all-read', (req: Request, res: Response) => {
  const { username, role } = req.body;
  try {
    const cleanUsername = String(username || '').trim().toLowerCase();
    if (isAdminRole(String(role))) {
      db.prepare(`
        UPDATE notifications 
        SET is_read = 1 
        WHERE recipient_username = 'ADMINS' OR recipient_username = ?
      `).run(cleanUsername);
    } else {
      db.prepare(`
        UPDATE notifications 
        SET is_read = 1 
        WHERE recipient_username = ?
      `).run(cleanUsername);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al marcar notificaciones' });
  }
});

// ==========================================
// INCIDENTS
// ==========================================

// List incidents (Strict user isolation: standard users ONLY see their own incidents!)
apiRouter.get('/incidents', (req: Request, res: Response) => {
  const { status, assigned_to, creator, search, category, priority, requester_role, requester_username } = req.query;

  try {
    let sql = `
      SELECT 
        i.id,
        i.code,
        i.title,
        i.status,
        i.priority,
        i.category,
        i.creator_username,
        i.assigned_admin_username,
        i.created_at,
        i.updated_at,
        i.last_message_at,
        u.full_name as creator_name,
        u.department as creator_department,
        adm.full_name as assigned_admin_name,
        (SELECT COUNT(*) FROM messages m WHERE m.incident_id = i.id) as message_count,
        (SELECT COUNT(*) FROM attachments a WHERE a.incident_id = i.id) as attachment_count
      FROM incidents i
      LEFT JOIN users u ON i.creator_username = u.username
      LEFT JOIN users adm ON i.assigned_admin_username = adm.username
      WHERE 1=1
    `;
    const params: any[] = [];

    // CRITICAL USER ISOLATION: Normal users only see their own tickets
    if (requester_role === 'user' && requester_username) {
      sql += ' AND i.creator_username = ?';
      params.push(String(requester_username).trim().toLowerCase());
    } else if (creator) {
      sql += ' AND i.creator_username = ?';
      params.push(String(creator).trim().toLowerCase());
    }

    if (status && status !== 'todos') {
      sql += ' AND i.status = ?';
      params.push(status);
    }

    if (category && category !== 'todos') {
      sql += ' AND i.category = ?';
      params.push(category);
    }

    if (priority && priority !== 'todos') {
      sql += ' AND i.priority = ?';
      params.push(priority);
    }

    if (assigned_to) {
      if (assigned_to === 'unassigned') {
        sql += ' AND (i.assigned_admin_username IS NULL OR i.assigned_admin_username = "")';
      } else {
        sql += ' AND i.assigned_admin_username = ?';
        params.push(assigned_to);
      }
    }

    if (search && typeof search === 'string' && search.trim()) {
      sql += ' AND (i.title LIKE ? OR i.code LIKE ? OR i.description LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY i.updated_at DESC LIMIT 100';

    const incidents = db.prepare(sql).all(...params);
    res.json(incidents);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al consultar incidencias' });
  }
});

// Get single incident by ID with messages and attachments (with privacy check)
apiRouter.get('/incidents/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { requester_role, requester_username } = req.query;

  try {
    const incident = db.prepare(`
      SELECT 
        i.*,
        u.full_name as creator_name,
        u.department as creator_department,
        adm.full_name as assigned_admin_name
      FROM incidents i
      LEFT JOIN users u ON i.creator_username = u.username
      LEFT JOIN users adm ON i.assigned_admin_username = adm.username
      WHERE i.id = ?
    `).get(id) as any;

    if (!incident) {
      return res.status(404).json({ error: 'Incidencia no encontrada' });
    }

    // PRIVACY ENFORCEMENT: If requester is a normal user, prevent viewing another user's incident
    if (requester_role === 'user' && requester_username) {
      const cleanReqUser = String(requester_username).trim().toLowerCase();
      if (incident.creator_username.toLowerCase() !== cleanReqUser) {
        return res.status(403).json({ error: 'Acceso denegado: solo puedes ver tus propias incidencias' });
      }
    }

    const messages = db.prepare(`
      SELECT 
        m.id,
        m.incident_id,
        m.sender_username,
        m.sender_role,
        m.content,
        m.created_at,
        u.full_name as sender_name
      FROM messages m
      LEFT JOIN users u ON m.sender_username = u.username
      WHERE m.incident_id = ?
      ORDER BY m.created_at ASC
    `).all(id) as any[];

    // Fetch attachments for this incident
    const attachments = db.prepare(`
      SELECT 
        id,
        message_id,
        incident_id,
        filename,
        mime_type,
        data_base64,
        size_bytes,
        created_at
      FROM attachments
      WHERE incident_id = ?
      ORDER BY created_at ASC
    `).all(id) as any[];

    // Group attachments by message_id
    const attachmentMap: Record<number, any[]> = {};
    for (const att of attachments) {
      if (!attachmentMap[att.message_id]) {
        attachmentMap[att.message_id] = [];
      }
      attachmentMap[att.message_id].push(att);
    }

    const messagesWithAttachments = messages.map(msg => ({
      ...msg,
      attachments: attachmentMap[msg.id] || [],
    }));

    res.json({
      incident,
      messages: messagesWithAttachments,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al obtener la incidencia' });
  }
});

// Create new incident
apiRouter.post('/incidents', (req: Request, res: Response) => {
  const {
    title,
    description,
    category = 'general',
    priority = 'media',
    creator_username,
    attachment,
  } = req.body;

  if (!title?.trim() || !description?.trim() || !creator_username?.trim()) {
    return res.status(400).json({ error: 'Titulo, descripcion y usuario creador son obligatorios' });
  }

  try {
    // The session token is the source of truth for the creator and for the
    // client machine data. Fall back to the request payload if there is no
    // token (for example, a browser that has not logged in again yet).
    const session = getSession(req);
    const cleanCreator = (session?.username || creator_username.trim()).toLowerCase();
    const clientIp = session?.ip || getClientIp(req);
    const clientMachine = getMachineByIp(clientIp);
    const clientMac = session?.mac || clientMachine?.mac || readClientMac(clientIp) || null;
    const clientHostname = session?.hostname || clientMachine?.hostname || null;
    const clientWindowsUser = session?.windows_user || clientMachine?.windows_user || null;
    const clientWindowsDomain = session?.windows_domain || clientMachine?.windows_domain || null;
    const clientSessionId = session?.id || null;
    const creatorRole = isAdminRole(session?.role) ? 'admin' : 'user';

    const year = new Date().getFullYear();
    const countRow = db.prepare('SELECT COUNT(*) as count FROM incidents').get() as { count: number };
    const nextSeq = (countRow.count + 1).toString().padStart(4, '0');
    const code = `INC-${year}-${nextSeq}`;

    const insertInc = db.prepare(`
      INSERT INTO incidents (
        code, title, description, category, priority, status, creator_username,
        client_ip, client_mac, client_hostname, client_windows_user, client_windows_domain,
        client_session_id, created_at, updated_at, last_message_at
      )
      VALUES (?, ?, ?, ?, ?, 'abierta', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    const result = insertInc.run(
      code,
      title.trim(),
      description.trim(),
      category,
      priority,
      cleanCreator,
      clientIp || null,
      clientMac,
      clientHostname,
      clientWindowsUser,
      clientWindowsDomain,
      clientSessionId
    );

    const incidentId = Number(result.lastInsertRowid);

    // Initial message
    const insertMsg = db.prepare(`
      INSERT INTO messages (incident_id, sender_username, sender_role, content, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const msgResult = insertMsg.run(
      incidentId,
      cleanCreator,
      creatorRole,
      description.trim()
    );
    const messageId = Number(msgResult.lastInsertRowid);

    // Save attachment if provided
    if (attachment && attachment.data_base64) {
      const insertAtt = db.prepare(`
        INSERT INTO attachments (message_id, incident_id, filename, mime_type, data_base64, size_bytes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      insertAtt.run(
        messageId,
        incidentId,
        attachment.filename || 'captura.webp',
        attachment.mime_type || 'image/webp',
        attachment.data_base64,
        attachment.size_bytes || Math.round(attachment.data_base64.length * 0.75)
      );
    }

    // CREATE NOTIFICATION FOR ADMINS: A new incident was opened!
    createNotification(
      'ADMINS',
      'new_incident',
      incidentId,
      code,
      `Nueva Incidencia: ${code}`,
      `@${cleanCreator} ha creado "${title.trim()}" (${category.toUpperCase()} - Prioridad ${priority.toUpperCase()})`
    );

    res.status(201).json({
      success: true,
      incidentId,
      code,
      message: 'Incidencia creada correctamente en IncidenciasTRANS',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al crear incidencia' });
  }
});

// Admin self-assign or reassign
apiRouter.patch('/incidents/:id/assign', (req: Request, res: Response) => {
  const { id } = req.params;
  const { admin_username } = req.body;

  if (!admin_username) {
    return res.status(400).json({ error: 'Nombre de administrador requerido' });
  }

  try {
    const inc = db.prepare('SELECT id, code, title, status, creator_username FROM incidents WHERE id = ?').get(id) as any;
    if (!inc) {
      return res.status(404).json({ error: 'Incidencia no encontrada' });
    }

    const cleanAdmin = admin_username.trim().toLowerCase();
    const newStatus = inc.status === 'abierta' ? 'en_progreso' : inc.status;

    db.prepare(`
      UPDATE incidents
      SET assigned_admin_username = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(cleanAdmin, newStatus, id);

    // Insert system message into conversation thread
    db.prepare(`
      INSERT INTO messages (incident_id, sender_username, sender_role, content, created_at)
      VALUES (?, 'IncidenciasTRANS', 'system', ?, CURRENT_TIMESTAMP)
    `).run(id, `Incidencia asignada al administrador @${cleanAdmin}`);

    // NOTIFY CREATOR USER: Admin has taken the ticket!
    createNotification(
      inc.creator_username,
      'assignment',
      inc.id,
      inc.code,
      `Incidencia Asignada: ${inc.code}`,
      `El administrador @${cleanAdmin} se ha asignado tu incidencia y está trabajando en ella.`
    );

    res.json({ success: true, assigned_admin_username: cleanAdmin, status: newStatus });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al asignar incidencia' });
  }
});

// Update incident status / priority
apiRouter.patch('/incidents/:id/status', (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, priority, admin_username } = req.body;

  try {
    const inc = db.prepare('SELECT id, code, title, status, priority, creator_username FROM incidents WHERE id = ?').get(id) as any;
    if (!inc) {
      return res.status(404).json({ error: 'Incidencia no encontrada' });
    }

    const updatedStatus = status || inc.status;
    const updatedPriority = priority || inc.priority;

    db.prepare(`
      UPDATE incidents
      SET status = ?, priority = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(updatedStatus, updatedPriority, id);

    // Log status change message in thread
    if (status && status !== inc.status) {
      const actor = admin_username ? `@${admin_username}` : 'Sistema';
      db.prepare(`
        INSERT INTO messages (incident_id, sender_username, sender_role, content, created_at)
        VALUES (?, 'IncidenciasTRANS', 'system', ?, CURRENT_TIMESTAMP)
      `).run(id, `Estado cambiado a '${updatedStatus.toUpperCase()}' por ${actor}`);

      // NOTIFY CREATOR USER of status change!
      createNotification(
        inc.creator_username,
        'status_change',
        inc.id,
        inc.code,
        `Cambio de Estado: ${inc.code}`,
        `Tu incidencia ahora se encuentra en estado "${updatedStatus.toUpperCase()}" por ${actor}.`
      );
    }

    res.json({ success: true, status: updatedStatus, priority: updatedPriority });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al actualizar estado' });
  }
});

// Add message to conversation thread + optional attachment
apiRouter.post('/incidents/:id/messages', (req: Request, res: Response) => {
  const { id } = req.params;
  const { sender_username, sender_role, content, attachment } = req.body;

  if (!sender_username || !content?.trim()) {
    return res.status(400).json({ error: 'Remitente y contenido son obligatorios' });
  }

  try {
    const inc = db.prepare('SELECT id, code, title, creator_username, assigned_admin_username FROM incidents WHERE id = ?').get(id) as any;
    if (!inc) {
      return res.status(404).json({ error: 'Incidencia no encontrada' });
    }

    const cleanSender = sender_username.trim().toLowerCase();
    const role = isAdminRole(sender_role) ? 'admin' : 'user';

    const insertMsg = db.prepare(`
      INSERT INTO messages (incident_id, sender_username, sender_role, content, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const result = insertMsg.run(
      id,
      cleanSender,
      role,
      content.trim()
    );
    const messageId = Number(result.lastInsertRowid);

    // Update incident timestamps
    db.prepare(`
      UPDATE incidents
      SET updated_at = CURRENT_TIMESTAMP, last_message_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);

    // Attach image if present
    let savedAttachment: any = null;
    if (attachment && attachment.data_base64) {
      const insertAtt = db.prepare(`
        INSERT INTO attachments (message_id, incident_id, filename, mime_type, data_base64, size_bytes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      const attResult = insertAtt.run(
        messageId,
        id,
        attachment.filename || 'adjunto.webp',
        attachment.mime_type || 'image/webp',
        attachment.data_base64,
        attachment.size_bytes || Math.round(attachment.data_base64.length * 0.75)
      );
      savedAttachment = {
        id: Number(attResult.lastInsertRowid),
        message_id: messageId,
        incident_id: Number(id),
        filename: attachment.filename || 'adjunto.webp',
        mime_type: attachment.mime_type || 'image/webp',
        data_base64: attachment.data_base64,
        size_bytes: attachment.size_bytes || Math.round(attachment.data_base64.length * 0.75),
      };
    }

    // SMART NOTIFICATION ROUTING:
    // If sent by user -> notify assigned admin, or all admins if unassigned
    // If sent by admin -> notify user
    const snippet = content.trim().length > 60 ? content.trim().substring(0, 60) + '...' : content.trim();

    if (role === 'user') {
      const targetAdmin = inc.assigned_admin_username || 'ADMINS';
      createNotification(
        targetAdmin,
        'new_message',
        inc.id,
        inc.code,
        `Nuevo comentario en ${inc.code}`,
        `@${cleanSender}: "${snippet}"`
      );
    } else {
      createNotification(
        inc.creator_username,
        'new_message',
        inc.id,
        inc.code,
        `Respuesta técnica en ${inc.code}`,
        `Soporte @${cleanSender}: "${snippet}"`
      );
    }

    res.status(201).json({
      success: true,
      message: {
        id: messageId,
        incident_id: Number(id),
        sender_username: cleanSender,
        sender_role: role,
        content: content.trim(),
        created_at: new Date().toISOString(),
        attachments: savedAttachment ? [savedAttachment] : [],
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al enviar mensaje' });
  }
});
