export type IncidentStatus = 'abierta' | 'en_progreso' | 'resuelta' | 'cerrada';
export type IncidentPriority = 'baja' | 'media' | 'alta' | 'critica';
export type IncidentCategory = 'hardware' | 'software' | 'red' | 'acceso' | 'general' | 'otros';

export interface User {
  id: number;
  username: string;
  role: 'user' | 'admin';
  full_name: string;
  department: string;
  is_active?: number;
  created_at?: string;
}

export interface AppNotification {
  id: number;
  recipient_username: string;
  type: 'new_incident' | 'status_change' | 'new_message' | 'assignment';
  incident_id: number;
  incident_code: string;
  title: string;
  content: string;
  is_read: number;
  created_at: string;
}

export interface Attachment {
  id: number;
  message_id: number;
  incident_id: number;
  filename: string;
  mime_type: string;
  data_base64: string;
  size_bytes: number;
  created_at: string;
}

export interface Message {
  id: number;
  incident_id: number;
  sender_username: string;
  sender_role: 'user' | 'admin' | 'system';
  content: string;
  created_at: string;
  sender_name?: string;
  attachments?: Attachment[];
}

export interface Incident {
  id: number;
  code: string;
  title: string;
  description: string;
  status: IncidentStatus;
  priority: IncidentPriority;
  category: IncidentCategory;
  creator_username: string;
  assigned_admin_username?: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  creator_name?: string;
  creator_department?: string;
  assigned_admin_name?: string;
  message_count?: number;
  attachment_count?: number;
}

export interface ServerStats {
  engine: string;
  dbPath: string;
  dbSizeBytes: number;
  dbSizeFormatted: string;
  journalMode: string;
  counts: {
    users: number;
    incidents: number;
    openIncidents: number;
    messages: number;
    attachments: number;
  };
  serverName: string;
  clientApp: string;
  uptimeSeconds: number;
  platform: string;
  nodeVersion: string;
}
