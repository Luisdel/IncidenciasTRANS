import express, { Request, Response } from 'express';
import crypto from 'node:crypto';
import { db, initDatabase, getDatabaseStats, createNotification } from './db.ts';

// Initialize DB schema on load
initDatabase();

export const apiRouter = express.Router();

// Parse json bodies with limit for compressed images
apiRouter.use(express.json({ limit: '8mb' }));

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

// User simple login (no password needed, but must exist in DB created by admin)
apiRouter.post('/auth/user-login', (req: Request, res: Response) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'El nombre de usuario es obligatorio' });
  }

  const cleanUsername = username.trim().toLowerCase();

  try {
    const user = db.prepare(`
      SELECT id, username, role, full_name, department, is_active 
      FROM users 
      WHERE username = ?
    `).get(cleanUsername) as any;

    if (!user) {
      return res.status(403).json({
        error: `El usuario '@${cleanUsername}' no está dado de alta en IncidenciasTRANS. Solicite a un administrador que lo registre en la sección de Gestión de Usuarios.`,
      });
    }

    if (user.is_active === 0) {
      return res.status(403).json({
        error: `El usuario '@${cleanUsername}' está desactivado temporalmente. Contacte con un administrador.`,
      });
    }

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

    if (!user || user.role !== 'admin') {
      return res.status(401).json({ error: 'Credenciales de administrador invalidas' });
    }

    if (user.is_active === 0) {
      return res.status(403).json({ error: 'Esta cuenta de administrador esta inactiva' });
    }

    const hashedInput = crypto.createHash('sha256').update(password).digest('hex');
    if (user.password_hash !== hashedInput) {
      return res.status(401).json({ error: 'Contrasena incorrecta' });
    }

    const token = crypto.randomBytes(24).toString('hex');
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
// USER MANAGEMENT (Admin Only)
// ==========================================

// List all users
apiRouter.get('/users', (_req: Request, res: Response) => {
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
      ORDER BY u.role DESC, u.created_at ASC
    `).all() as any[];

    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al listar usuarios' });
  }
});

// Create new user or admin
apiRouter.post('/users', (req: Request, res: Response) => {
  const { username, role = 'user', full_name, department, password } = req.body;

  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'El nombre de usuario es obligatorio' });
  }

  const cleanUsername = username.trim().toLowerCase();
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
apiRouter.patch('/users/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { full_name, department, role, password, is_active } = req.body;

  try {
    const user = db.prepare('SELECT id, username, role, password_hash FROM users WHERE id = ?').get(id) as any;
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const targetRole = role !== undefined ? (role === 'admin' ? 'admin' : 'user') : user.role;
    let targetPasswordHash = user.password_hash;

    if (password && password.trim()) {
      targetPasswordHash = crypto.createHash('sha256').update(password.trim()).digest('hex');
    }

    const targetActive = is_active !== undefined ? (is_active ? 1 : 0) : 1;

    db.prepare(`
      UPDATE users 
      SET full_name = COALESCE(?, full_name),
          department = COALESCE(?, department),
          role = ?,
          password_hash = ?,
          is_active = ?
      WHERE id = ?
    `).run(
      full_name !== undefined ? full_name.trim() : null,
      department !== undefined ? department.trim() : null,
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
apiRouter.delete('/users/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(id) as any;
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Protect last admin
    if (user.role === 'admin') {
      const adminCount = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = 1").get() as { count: number }).count;
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'No se puede eliminar el único administrador activo del sistema' });
      }
    }

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
    const isAdmin = role === 'admin';

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
    if (role === 'admin') {
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
    const cleanCreator = creator_username.trim().toLowerCase();
    const year = new Date().getFullYear();
    const countRow = db.prepare('SELECT COUNT(*) as count FROM incidents').get() as { count: number };
    const nextSeq = (countRow.count + 1).toString().padStart(4, '0');
    const code = `INC-${year}-${nextSeq}`;

    const insertInc = db.prepare(`
      INSERT INTO incidents (code, title, description, category, priority, status, creator_username, created_at, updated_at, last_message_at)
      VALUES (?, ?, ?, ?, ?, 'abierta', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    const result = insertInc.run(
      code,
      title.trim(),
      description.trim(),
      category,
      priority,
      cleanCreator
    );

    const incidentId = Number(result.lastInsertRowid);

    // Initial message
    const insertMsg = db.prepare(`
      INSERT INTO messages (incident_id, sender_username, sender_role, content, created_at)
      VALUES (?, ?, 'user', ?, CURRENT_TIMESTAMP)
    `);

    const msgResult = insertMsg.run(
      incidentId,
      cleanCreator,
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
    const role = sender_role === 'admin' ? 'admin' : 'user';

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
