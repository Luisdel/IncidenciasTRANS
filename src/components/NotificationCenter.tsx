import React, { useState, useEffect, useRef } from 'react';
import { 
  Bell, 
  Check, 
  CheckCheck, 
  AlertTriangle, 
  CheckCircle, 
  UserCheck, 
  MessageSquare, 
  X, 
  ExternalLink 
} from 'lucide-react';
import { AppNotification, User } from '../types.ts';
import { apiClient } from '../services/apiClient.ts';

interface NotificationCenterProps {
  currentUser: User | null;
  onSelectIncident: (incidentId: number) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  currentUser,
  onSelectIncident,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestToast, setLatestToast] = useState<AppNotification | null>(null);

  const prevNotificationsRef = useRef<AppNotification[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Poll notifications every 5 seconds for real-time LAN updates
  const pollNotifications = async () => {
    if (!currentUser) return;
    try {
      const res = await apiClient.getNotifications(currentUser.username, currentUser.role);
      const incoming = res.notifications as AppNotification[];

      // Check if new unread notification arrived to display toast
      if (prevNotificationsRef.current.length > 0 && incoming.length > 0) {
        const newest = incoming[0];
        const prevNewest = prevNotificationsRef.current[0];
        if (newest && (!prevNewest || newest.id !== prevNewest.id) && newest.is_read === 0) {
          setLatestToast(newest);
          // Auto hide toast after 6 seconds
          setTimeout(() => setLatestToast(null), 6000);
        }
      }

      prevNotificationsRef.current = incoming;
      setNotifications(incoming);
      setUnreadCount(res.unreadCount);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    pollNotifications();
    const interval = setInterval(pollNotifications, 5000);
    return () => clearInterval(interval);
  }, [currentUser?.username, currentUser?.role]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (!currentUser) return null;

  const handleMarkAsRead = async (notif: AppNotification, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await apiClient.markNotificationRead(notif.id);
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: 1 } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {
      // ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiClient.markAllNotificationsRead(currentUser.username, currentUser.role);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  };

  const handleNotificationClick = (notif: AppNotification) => {
    handleMarkAsRead(notif);
    setIsOpen(false);
    setLatestToast(null);
    onSelectIncident(notif.incident_id);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'new_incident':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'status_change':
        return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'assignment':
        return <UserCheck className="w-4 h-4 text-purple-400" />;
      case 'new_message':
      default:
        return <MessageSquare className="w-4 h-4 text-sky-400" />;
    }
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
      if (diffSec < 60) return 'Hace unos segundos';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `Hace ${diffMin} min`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `Hace ${diffHour} h`;
      return new Date(isoString).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    } catch {
      return '';
    }
  };

  return (
    <>
      {/* Toast Alert popup on live event */}
      {latestToast && (
        <div 
          onClick={() => handleNotificationClick(latestToast)}
          className="fixed top-16 right-4 z-50 max-w-sm w-full bg-slate-900 border border-sky-500/80 rounded-xl p-3.5 shadow-2xl cursor-pointer hover:border-sky-400 transition-all animate-in slide-in-from-top-4 duration-200"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 bg-slate-950 rounded-lg shrink-0 border border-slate-800">
              {getNotificationIcon(latestToast.type)}
            </div>
            <div className="flex-1 min-w-0 text-xs">
              <div className="flex items-center justify-between gap-1">
                <span className="font-bold text-white truncate">{latestToast.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setLatestToast(null);
                  }}
                  className="text-slate-400 hover:text-white p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-slate-300 mt-0.5 line-clamp-2 text-[11px]">{latestToast.content}</p>
              <div className="mt-1 text-[10px] text-sky-400 font-medium flex items-center gap-1">
                <span>Abrir incidencia</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bell Button and Dropdown Menu */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="relative p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          title="Notificaciones en tiempo real"
        >
          <Bell className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse shadow">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in duration-150">
            {/* Header */}
            <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">Notificaciones</span>
                {unreadCount > 0 ? (
                  <span className="text-[10px] bg-red-950 text-red-400 border border-red-800 px-1.5 py-0.2 rounded font-semibold">
                    {unreadCount} nuevas
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded">
                    Al día
                  </span>
                )}
              </div>

              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Marcar todas leídas</span>
                </button>
              )}
            </div>

            {/* List */}
            <div className="overflow-y-auto divide-y divide-slate-800/80 max-h-96">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  <Bell className="w-6 h-6 mx-auto mb-2 opacity-40" />
                  <p>No tienes notificaciones pendientes</p>
                </div>
              ) : (
                notifications.map((notif) => (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`p-3 text-xs cursor-pointer transition-colors flex items-start gap-3 hover:bg-slate-850 ${
                      notif.is_read === 0 ? 'bg-slate-950/70' : 'opacity-70'
                    }`}
                  >
                    <div className="p-2 bg-slate-800 rounded-lg shrink-0 mt-0.5">
                      {getNotificationIcon(notif.type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`truncate text-xs ${notif.is_read === 0 ? 'font-bold text-white' : 'font-medium text-slate-300'}`}>
                          {notif.title}
                        </span>
                        <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                          {formatRelativeTime(notif.created_at)}
                        </span>
                      </div>

                      <p className="text-slate-400 text-[11px] line-clamp-2 mt-0.5 leading-relaxed">
                        {notif.content}
                      </p>

                      <div className="flex items-center justify-between mt-1 pt-1">
                        <span className="font-mono text-[10px] text-sky-400 bg-sky-950/60 px-1 rounded">
                          {notif.incident_code}
                        </span>

                        {notif.is_read === 0 && (
                          <button
                            onClick={(e) => handleMarkAsRead(notif, e)}
                            className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1"
                            title="Marcar como leída"
                          >
                            <Check className="w-3 h-3" />
                            <span>Leída</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};
