import { ClientMachine, ClientSession, Incident, Message, ServerStats, User } from '../types.ts';

// Bandwidth telemetry for low-network transparency
export interface NetworkStats {
  bytesSent: number;
  bytesReceived: number;
  totalRequests: number;
  lastLatencyMs: number;
}

export const networkStats: NetworkStats = {
  bytesSent: 0,
  bytesReceived: 0,
  totalRequests: 0,
  lastLatencyMs: 0,
};

const listeners: Array<() => void> = [];

export function subscribeNetworkStats(cb: () => void) {
  listeners.push(cb);
  return () => {
    const idx = listeners.indexOf(cb);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function notifyStats() {
  for (const cb of listeners) cb();
}

export function setSessionToken(token: string | null) {
  if (typeof localStorage === 'undefined') return;
  if (token) {
    localStorage.setItem('incidencias_token', token);
  } else {
    localStorage.removeItem('incidencias_token');
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const start = performance.now();
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('incidencias_token') : null;
  if (token) {
    headers.set('X-Session-Token', token);
  }

  let bodyLength = 0;
  if (options.body && typeof options.body === 'string') {
    bodyLength = new Blob([options.body]).size;
  }

  networkStats.bytesSent += bodyLength;
  networkStats.totalRequests += 1;

  try {
    const res = await fetch(`/api${endpoint}`, {
      ...options,
      headers,
    });

    const latency = Math.round(performance.now() - start);
    networkStats.lastLatencyMs = latency;

    const text = await res.text();
    networkStats.bytesReceived += new Blob([text]).size;
    notifyStats();

    if (!res.ok) {
      let errorMsg = `Error HTTP ${res.status}`;
      try {
        const errorJson = JSON.parse(text);
        if (errorJson.error) errorMsg = errorJson.error;
      } catch {
        // fallback
      }
      throw new Error(errorMsg);
    }

    return JSON.parse(text) as T;
  } catch (err: any) {
    networkStats.lastLatencyMs = Math.round(performance.now() - start);
    notifyStats();
    throw err;
  }
}

export const apiClient = {
  // Auth
  loginUser: async (username: string, fullName?: string, department?: string): Promise<{ success: boolean; user: User; token: string }> => {
    return request('/auth/user-login', {
      method: 'POST',
      body: JSON.stringify({ username, fullName, department }),
    });
  },

  loginAdmin: async (username: string, password: string): Promise<{ success: boolean; user: User; token: string }> => {
    return request('/auth/admin-login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  // Incidents (with strict user isolation parameters)
  getIncidents: async (params?: {
    status?: string;
    category?: string;
    priority?: string;
    assigned_to?: string;
    creator?: string;
    search?: string;
    requester_role?: string;
    requester_username?: string;
  }): Promise<Incident[]> => {
    const searchParams = new URLSearchParams();
    if (params) {
      for (const [key, val] of Object.entries(params)) {
        if (val !== undefined && val !== null && val !== '') {
          searchParams.append(key, val);
        }
      }
    }
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return request(`/incidents${query}`);
  },

  getIncident: async (
    id: number,
    requester?: { role: string; username: string }
  ): Promise<{ incident: Incident; messages: Message[] }> => {
    const query = requester ? `?requester_role=${encodeURIComponent(requester.role)}&requester_username=${encodeURIComponent(requester.username)}` : '';
    return request(`/incidents/${id}${query}`);
  },

  createIncident: async (payload: {
    title: string;
    description: string;
    category?: string;
    priority?: string;
    creator_username: string;
    attachment?: {
      filename: string;
      mime_type: string;
      data_base64: string;
      size_bytes: number;
    };
  }): Promise<{ success: boolean; incidentId: number; code: string }> => {
    return request('/incidents', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  assignIncident: async (id: number, adminUsername: string): Promise<{ success: boolean; assigned_admin_username: string; status: string }> => {
    return request(`/incidents/${id}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ admin_username: adminUsername }),
    });
  },

  updateIncidentStatus: async (
    id: number,
    payload: { status?: string; priority?: string; admin_username?: string }
  ): Promise<{ success: boolean; status: string; priority: string }> => {
    return request(`/incidents/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  addMessage: async (
    incidentId: number,
    payload: {
      sender_username: string;
      sender_role: 'user' | 'admin' | 'superadmin';
      content: string;
      attachment?: {
        filename: string;
        mime_type: string;
        data_base64: string;
        size_bytes: number;
      };
    }
  ): Promise<{ success: boolean; message: Message }> => {
    return request(`/incidents/${incidentId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // User Management (Admin only)
  getUsers: async (): Promise<User[]> => {
    return request('/users');
  },

  createUser: async (payload: {
    username: string;
    role: 'user' | 'admin';
    full_name?: string;
    department?: string;
    password?: string;
  }): Promise<{ success: boolean; user: User }> => {
    return request('/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateUser: async (
    id: number,
    payload: {
      full_name?: string;
      department?: string;
      role?: 'user' | 'admin';
      password?: string;
      is_active?: boolean;
    }
  ): Promise<{ success: boolean; message: string }> => {
    return request(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  deleteUser: async (id: number): Promise<{ success: boolean; message: string }> => {
    return request(`/users/${id}`, {
      method: 'DELETE',
    });
  },

  // Notifications
  getNotifications: async (username: string, role: string): Promise<{ notifications: any[]; unreadCount: number }> => {
    return request(`/notifications?username=${encodeURIComponent(username)}&role=${encodeURIComponent(role)}`);
  },

  markNotificationRead: async (id: number): Promise<{ success: boolean }> => {
    return request(`/notifications/${id}/read`, {
      method: 'PATCH',
    });
  },

  markAllNotificationsRead: async (username: string, role: string): Promise<{ success: boolean }> => {
    return request('/notifications/mark-all-read', {
      method: 'PATCH',
      body: JSON.stringify({ username, role }),
    });
  },

  // Client sessions and registered machines (Admin / Superadmin)
  getSessions: async (): Promise<ClientSession[]> => {
    return request('/sessions');
  },

  getClientMachines: async (): Promise<ClientMachine[]> => {
    return request('/client-machines');
  },

  getAgentDownloadUrl: (): string => '/api/client-agent.ps1',

  // Superadmin database maintenance
  wipeIncidents: async (confirmation: string): Promise<{
    success: boolean;
    message: string;
    deleted: { incidents: number; messages: number; attachments: number; notifications: number };
  }> => {
    return request('/admin/wipe/incidents', {
      method: 'POST',
      body: JSON.stringify({ confirmation }),
    });
  },

  wipeUsers: async (confirmation: string, deleteIncidents: boolean): Promise<{
    success: boolean;
    message: string;
    deleted: { users: number; incidents: number };
  }> => {
    return request('/admin/wipe/users', {
      method: 'POST',
      body: JSON.stringify({ confirmation, deleteIncidents }),
    });
  },

  getServerStats: async (): Promise<ServerStats> => {
    return request('/server/stats');
  },
};
