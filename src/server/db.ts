import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

// Path to SQLite database file
const DB_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}
const DB_PATH = path.join(DB_DIR, 'incidencias.db');

export const db = new DatabaseSync(DB_PATH);

// Enable WAL mode and foreign keys for high performance and low lock contention
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      role TEXT NOT NULL DEFAULT 'user', -- 'user' | 'admin'
      password_hash TEXT,
      full_name TEXT,
      department TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'abierta', -- 'abierta', 'en_progreso', 'resuelta', 'cerrada'
      priority TEXT NOT NULL DEFAULT 'media', -- 'baja', 'media', 'alta', 'critica'
      category TEXT NOT NULL DEFAULT 'general', -- 'hardware', 'software', 'red', 'acceso', 'otros'
      creator_username TEXT NOT NULL,
      assigned_admin_username TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
    CREATE INDEX IF NOT EXISTS idx_incidents_creator ON incidents(creator_username);
    CREATE INDEX IF NOT EXISTS idx_incidents_assigned ON incidents(assigned_admin_username);
    CREATE INDEX IF NOT EXISTS idx_incidents_updated ON incidents(updated_at DESC);

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      sender_username TEXT NOT NULL,
      sender_role TEXT NOT NULL, -- 'user' | 'admin' | 'system'
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_messages_incident ON messages(incident_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data_base64 TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_attachments_msg ON attachments(message_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_inc ON attachments(incident_id);

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_username TEXT NOT NULL, -- 'ADMINS' for all admins or specific username
      type TEXT NOT NULL, -- 'new_incident', 'status_change', 'new_message', 'assignment'
      incident_id INTEGER NOT NULL,
      incident_code TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications(recipient_username, is_read, created_at DESC);
  `);

  // Ensure is_active column exists if database was created previously
  try {
    db.exec('ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;');
  } catch {
    // Column already exists
  }

  // Seed default admin if not exists
  const checkAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!checkAdmin) {
    const adminPassHash = crypto.createHash('sha256').update('admin123').digest('hex');
    const insertAdmin = db.prepare(`
      INSERT INTO users (username, role, password_hash, full_name, department)
      VALUES (?, 'admin', ?, 'Administrador Principal', 'Soporte IT')
    `);
    insertAdmin.run('admin', adminPassHash);

    // Seed default sample user
    const insertUser = db.prepare(`
      INSERT OR IGNORE INTO users (username, role, full_name, department)
      VALUES (?, 'user', ?, ?)
    `);
    insertUser.run('luis', 'Luis Martinez', 'Logistica y Transporte');
    insertUser.run('maria', 'Maria Santos', 'Administracion');

    // Seed initial incidents
    seedInitialData();
  }
}

function seedInitialData() {
  const insertInc = db.prepare(`
    INSERT INTO incidents (code, title, description, status, priority, category, creator_username, assigned_admin_username)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const inc1 = insertInc.run(
    'INC-2026-001',
    'Fallo conexion lector de codigo de barras en muelle 3',
    'El lector Honeywell no sincroniza los paquetes desde el cambio de turno. Muestra luz parpadeante en ambar.',
    'abierta',
    'alta',
    'hardware',
    'luis',
    null
  );

  const inc2 = insertInc.run(
    'INC-2026-002',
    'Error de impresion de etiquetas de expedicion',
    'La impresora Zebra de la oficina central expulsa hojas en blanco tras enviar el lote diario.',
    'en_progreso',
    'media',
    'hardware',
    'maria',
    'admin'
  );

  const insertMsg = db.prepare(`
    INSERT INTO messages (incident_id, sender_username, sender_role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Messages for inc 1
  insertMsg.run(
    inc1.lastInsertRowid,
    'luis',
    'user',
    'Hola, hemos probado a reiniciar el terminal pero sigue sin leer. Dejo constancia para que lo revise el equipo de soporte.',
    new Date(Date.now() - 3600000 * 2).toISOString()
  );

  // Messages for inc 2
  insertMsg.run(
    inc2.lastInsertRowid,
    'maria',
    'user',
    'Buenas tardes, hemos cambiado el rollo termico pero no reconoce el sensor de corte.',
    new Date(Date.now() - 3600000 * 5).toISOString()
  );
  insertMsg.run(
    inc2.lastInsertRowid,
    'admin',
    'admin',
    'Hola Maria, me he asignado la incidencia. Voy a enviar el calibrador automatico desde la consola remota en 5 minutos.',
    new Date(Date.now() - 3600000 * 3).toISOString()
  );
}

export function getDatabaseStats() {
  let fileSize = 0;
  try {
    const stats = fs.statSync(DB_PATH);
    fileSize = stats.size;
  } catch {
    fileSize = 0;
  }

  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  const incidentCount = (db.prepare('SELECT COUNT(*) as count FROM incidents').get() as { count: number }).count;
  const openCount = (db.prepare("SELECT COUNT(*) as count FROM incidents WHERE status = 'abierta'").get() as { count: number }).count;
  const messageCount = (db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number }).count;
  const attachmentCount = (db.prepare('SELECT COUNT(*) as count FROM attachments').get() as { count: number }).count;

  return {
    engine: 'SQLite (node:sqlite native)',
    dbPath: DB_PATH,
    dbSizeBytes: fileSize,
    dbSizeFormatted: `${(fileSize / 1024).toFixed(1)} KB`,
    journalMode: 'WAL',
    counts: {
      users: userCount,
      incidents: incidentCount,
      openIncidents: openCount,
      messages: messageCount,
      attachments: attachmentCount,
    },
    serverName: 'IncidenciasTRANS',
    clientApp: 'ClienteINCIDENCIAS',
    uptimeSeconds: Math.floor(process.uptime()),
    platform: process.platform,
    nodeVersion: process.version,
  };
}

export function createNotification(
  recipient: string,
  type: 'new_incident' | 'status_change' | 'new_message' | 'assignment',
  incidentId: number,
  incidentCode: string,
  title: string,
  content: string
) {
  try {
    const stmt = db.prepare(`
      INSERT INTO notifications (recipient_username, type, incident_id, incident_code, title, content, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
    `);
    stmt.run(recipient, type, incidentId, incidentCode, title, content);
  } catch (err) {
    console.error('Error al registrar notificacion en SQLite:', err);
  }
}

