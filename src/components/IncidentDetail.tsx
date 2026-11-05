import React, { useState, useEffect, useRef } from 'react';
import { 
  Incident, 
  Message, 
  User, 
  IncidentStatus, 
  IncidentPriority 
} from '../types.ts';
import { apiClient } from '../services/apiClient.ts';
import { 
  compressImage, 
  formatBytes, 
  CompressionResult 
} from '../utils/imageCompressor.ts';
import { 
  ArrowLeft, 
  Send, 
  Paperclip, 
  Image as ImageIcon, 
  X, 
  CheckCircle, 
  Clock, 
  UserCheck, 
  Shield, 
  AlertCircle, 
  User as UserIcon, 
  Maximize2, 
  RefreshCw,
  Zap,
  Info,
  Monitor,
  Copy
} from 'lucide-react';
import { ImageViewerModal } from './ImageViewerModal.tsx';

interface IncidentDetailProps {
  incidentId: number;
  currentUser: User | null;
  onBack: () => void;
  onIncidentUpdated: () => void;
}

export const IncidentDetail: React.FC<IncidentDetailProps> = ({
  incidentId,
  currentUser,
  onBack,
  onIncidentUpdated,
}) => {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New message form
  const [commentText, setCommentText] = useState('');
  const [attachment, setAttachment] = useState<CompressionResult | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Lightbox modal
  const [activeImage, setActiveImage] = useState<{ url: string; filename: string; size: number } | null>(null);

  // Client equipment info copy feedback
  const [copiedClientField, setCopiedClientField] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';

  const copyClientField = async (label: string, value?: string | null) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedClientField(label);
      setTimeout(() => setCopiedClientField(null), 1500);
    } catch {
      // Clipboard may be blocked; ignore.
    }
  };

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const requester = currentUser ? { role: currentUser.role, username: currentUser.username } : undefined;
      const res = await apiClient.getIncident(incidentId, requester);
      setIncident(res.incident);
      setMessages(res.messages);
    } catch (err: any) {
      setError(err.message || 'Error al cargar los detalles de la incidencia');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    // Lightweight polling every 12 seconds for local LAN thread synchronization
    const timer = setInterval(() => {
      loadData(true);
    }, 12000);
    return () => clearInterval(timer);
  }, [incidentId]);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Handle file selection with client-side compression
  const handleFileProcess = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona un archivo de imagen (PNG, JPG, WebP, etc.)');
      return;
    }

    setIsCompressing(true);
    try {
      const compressed = await compressImage(file, 1280, 0.78);
      setAttachment(compressed);
    } catch (err: any) {
      alert('Error al comprimir la imagen: ' + err.message);
    } finally {
      setIsCompressing(false);
    }
  };

  // Support pasting image from clipboard (Ctrl+V)
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          handleFileProcess(file);
          break;
        }
      }
    }
  };

  // Send message
  const handleSendMessage = async (e?: React.FormEvent, statusOverride?: IncidentStatus) => {
    if (e) e.preventDefault();
    if (!commentText.trim() && !attachment) return;

    if (!currentUser) {
      alert('Debes identificarte para participar en la conversación');
      return;
    }

    setIsSending(true);
    try {
      await apiClient.addMessage(incidentId, {
        sender_username: currentUser.username,
        sender_role: currentUser.role,
        content: commentText.trim() || '(Imagen adjunta)',
        attachment: attachment
          ? {
              filename: attachment.filename,
              mime_type: attachment.mime_type,
              data_base64: attachment.data_base64,
              size_bytes: attachment.size_bytes,
            }
          : undefined,
      });

      // Clear input
      setCommentText('');
      setAttachment(null);

      // If status override requested (e.g. "Responder y Resolver")
      if (statusOverride && incident) {
        await apiClient.updateIncidentStatus(incidentId, {
          status: statusOverride,
          admin_username: currentUser.username,
        });
      }

      await loadData(true);
      onIncidentUpdated();
    } catch (err: any) {
      alert('Error al enviar el mensaje: ' + err.message);
    } finally {
      setIsSending(false);
    }
  };

  // Self assign incident
  const handleAssignToMe = async () => {
    if (!currentUser) return;
    try {
      await apiClient.assignIncident(incidentId, currentUser.username);
      await loadData(true);
      onIncidentUpdated();
    } catch (err: any) {
      alert('Error al asignar incidencia: ' + err.message);
    }
  };

  // Change status
  const handleStatusChange = async (newStatus: IncidentStatus) => {
    try {
      await apiClient.updateIncidentStatus(incidentId, {
        status: newStatus,
        admin_username: currentUser?.username,
      });
      await loadData(true);
      onIncidentUpdated();
    } catch (err: any) {
      alert('Error al actualizar estado: ' + err.message);
    }
  };

  // Change priority
  const handlePriorityChange = async (newPriority: IncidentPriority) => {
    try {
      await apiClient.updateIncidentStatus(incidentId, {
        priority: newPriority,
        admin_username: currentUser?.username,
      });
      await loadData(true);
      onIncidentUpdated();
    } catch (err: any) {
      alert('Error al actualizar prioridad: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-sky-400 mb-3" />
        <p className="text-sm">Consultando registro en SQLite en IncidenciasTRANS...</p>
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-red-300">
        <AlertCircle className="w-8 h-8 mx-auto text-red-400 mb-2" />
        <h3 className="text-sm font-bold">No se pudo cargar la incidencia</h3>
        <p className="text-xs text-slate-400 mt-1">{error || 'Incidencia no encontrada'}</p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs rounded-lg inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" /> Volver a la lista
        </button>
      </div>
    );
  }

  const isAssignedToCurrentAdmin = isAdmin && incident.assigned_admin_username === currentUser?.username;

  return (
    <div className="space-y-4">
      {/* Lightbox Modal */}
      {activeImage && (
        <ImageViewerModal
          isOpen={Boolean(activeImage)}
          onClose={() => setActiveImage(null)}
          imageUrl={activeImage.url}
          filename={activeImage.filename}
          sizeBytes={activeImage.size}
        />
      )}

      {/* Top Navigation & Status Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700"
            title="Volver a la cola"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-sky-400 bg-sky-950/80 border border-sky-800 px-2 py-0.5 rounded">
                {incident.code}
              </span>
              <span className="text-xs text-slate-400 uppercase tracking-wider bg-slate-800 px-2 py-0.5 rounded">
                {incident.category}
              </span>
              {refreshing && (
                <span className="text-[10px] text-sky-400 flex items-center gap-1">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" /> sincronizando
                </span>
              )}
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white mt-1">
              {incident.title}
            </h2>
          </div>
        </div>

        {/* Admin Controls / Assignment Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <>
              {/* Assignment control */}
              {!incident.assigned_admin_username ? (
                <button
                  onClick={handleAssignToMe}
                  className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Asignarme incidencia</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
                  <UserCheck className="w-3.5 h-3.5 text-sky-400" />
                  <span>Asignada: <strong>@{incident.assigned_admin_username}</strong></span>
                  {!isAssignedToCurrentAdmin && (
                    <button
                      onClick={handleAssignToMe}
                      className="text-xs text-sky-400 hover:underline ml-1"
                    >
                      (Reasignar a mí)
                    </button>
                  )}
                </div>
              )}

              {/* Status Selector */}
              <select
                value={incident.status}
                onChange={(e) => handleStatusChange(e.target.value as IncidentStatus)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-200 focus:outline-hidden focus:border-sky-500"
              >
                <option value="abierta">Estado: Abierta</option>
                <option value="en_progreso">Estado: En Curso</option>
                <option value="resuelta">Estado: Resuelta</option>
                <option value="cerrada">Estado: Cerrada</option>
              </select>

              {/* Priority Selector */}
              <select
                value={incident.priority}
                onChange={(e) => handlePriorityChange(e.target.value as IncidentPriority)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-200 focus:outline-hidden focus:border-sky-500"
              >
                <option value="baja">Prioridad: Baja</option>
                <option value="media">Prioridad: Media</option>
                <option value="alta">Prioridad: Alta</option>
                <option value="critica">Prioridad: Crítica</option>
              </select>
            </>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className={`px-2.5 py-1 rounded-full font-medium ${
                incident.status === 'abierta' ? 'bg-sky-950 text-sky-400 border border-sky-800' :
                incident.status === 'en_progreso' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                incident.status === 'resuelta' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                'bg-slate-800 text-slate-400 border border-slate-700'
              }`}>
                Estado: {incident.status.toUpperCase()}
              </span>

              {incident.assigned_admin_username ? (
                <span className="text-slate-300 bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-lg flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  Atiende: @{incident.assigned_admin_username}
                </span>
              ) : (
                <span className="text-amber-400/90 bg-amber-950/60 border border-amber-800/60 px-2.5 py-1 rounded-lg">
                  En espera de asignación técnica
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Incident Metadata & Creator Banner */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl px-4 py-2.5 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span>Creado por: <strong className="text-white">@{incident.creator_username}</strong> {incident.creator_name ? `(${incident.creator_name})` : ''}</span>
          {incident.creator_department && (
            <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300">
              Depto: {incident.creator_department}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            {new Date(incident.created_at).toLocaleString('es-ES')}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>Hilo ligero optimizado para red privada LAN</span>
        </div>
      </div>

      {/* Client equipment info (admin/superadmin only) */}
      {isAdmin && (
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-sky-300">
              <Monitor className="w-4 h-4" />
              Equipo del solicitante
            </div>
            <span className="text-[10px] text-slate-500">Datos para soporte remoto</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mt-3">
            {[
              { label: 'IP', value: incident.client_ip },
              { label: 'MAC', value: incident.client_mac },
              { label: 'Equipo', value: incident.client_hostname },
              { label: 'Usuario Windows', value: incident.client_windows_user },
              { label: 'Dominio', value: incident.client_windows_domain },
            ].map((field) => (
              <div key={field.label} className="bg-slate-950/60 border border-slate-800 rounded-lg px-2.5 py-1.5">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">{field.label}</div>
                <div className="text-xs text-slate-200 font-mono truncate flex items-center gap-1">
                  {field.value ? (
                    <>
                      <span className="truncate">{field.value}</span>
                      <button
                        type="button"
                        onClick={() => copyClientField(field.label, field.value)}
                        className="text-slate-500 hover:text-sky-300 shrink-0"
                        title="Copiar"
                      >
                        {copiedClientField === field.label ? (
                          <CheckCircle className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {!incident.client_ip && !incident.client_mac && !incident.client_hostname && !incident.client_windows_user && !incident.client_windows_domain && (
            <p className="text-[10px] text-slate-500 mt-2">
              Sin datos del equipo. Instala el agente de IncidenciasTRANS en el PC del usuario para capturar MAC, equipo, usuario y dominio.
            </p>
          )}
        </div>
      )}

      {/* Conversation Thread Container */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-inner flex flex-col min-h-[420px]">
        {/* Messages Stream */}
        <div className="flex-1 p-4 sm:p-6 space-y-4 overflow-y-auto max-h-[60vh]">
          {messages.map((msg) => {
            const isSystem = msg.sender_role === 'system';
            const isMsgAdmin = msg.sender_role === 'admin';
            const isMsgCurrentUser = currentUser && msg.sender_username.toLowerCase() === currentUser.username.toLowerCase();

            if (isSystem) {
              return (
                <div key={msg.id} className="flex items-center justify-center my-3">
                  <div className="bg-slate-900/90 border border-slate-800 text-slate-400 text-xs px-3 py-1 rounded-full flex items-center gap-1.5 shadow-xs">
                    <Info className="w-3.5 h-3.5 text-sky-400" />
                    <span>{msg.content}</span>
                    <span className="text-[10px] text-slate-600">
                      • {new Date(msg.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-[88%] sm:max-w-[80%] ${
                  isMsgCurrentUser ? 'ml-auto flex-row-reverse' : 'mr-auto'
                }`}
              >
                {/* Avatar Icon */}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                  isMsgAdmin
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-slate-800 text-sky-400 border border-slate-700'
                }`}>
                  {isMsgAdmin ? <Shield className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
                </div>

                {/* Message Bubble */}
                <div className={`rounded-2xl p-3.5 sm:p-4 text-xs sm:text-sm shadow-sm space-y-2 ${
                  isMsgAdmin
                    ? 'bg-slate-900 border border-amber-900/40 text-slate-100'
                    : isMsgCurrentUser
                    ? 'bg-sky-950/80 border border-sky-800/60 text-slate-100'
                    : 'bg-slate-900 border border-slate-800 text-slate-200'
                }`}>
                  {/* Sender title & timestamp */}
                  <div className="flex items-center justify-between gap-3 text-[11px] pb-1 border-b border-white/5">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <span className={isMsgAdmin ? 'text-amber-400' : 'text-sky-300'}>
                        @{msg.sender_username}
                      </span>
                      {isMsgAdmin && (
                        <span className="bg-amber-950 text-amber-300 border border-amber-800/80 px-1.5 py-0.2 rounded text-[10px]">
                          IncidenciasTRANS Soporte
                        </span>
                      )}
                      {msg.sender_name && (
                        <span className="text-slate-400 font-normal">({msg.sender_name})</span>
                      )}
                    </div>
                    <span className="text-slate-500 font-mono text-[10px]">
                      {new Date(msg.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Message Content */}
                  <div className="text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {msg.content}
                  </div>

                  {/* Attached Images */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="pt-2 space-y-2">
                      {msg.attachments.map((att) => (
                        <div
                          key={att.id}
                          className="group relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 max-w-sm cursor-pointer shadow hover:border-sky-500/60 transition-all"
                          onClick={() => setActiveImage({ url: att.data_base64, filename: att.filename, size: att.size_bytes })}
                        >
                          <img
                            src={att.data_base64}
                            alt={att.filename}
                            className="max-h-56 w-full object-cover group-hover:scale-102 transition-transform duration-200"
                            loading="lazy"
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2 text-[11px] text-white flex items-center justify-between">
                            <span className="truncate max-w-[200px]">{att.filename}</span>
                            <div className="flex items-center gap-1 text-slate-300 font-mono text-[10px]">
                              <span>{formatBytes(att.size_bytes)}</span>
                              <Maximize2 className="w-3 h-3 text-sky-400" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Composer & Low-Bandwidth Attachment Box */}
        <div className="p-4 bg-slate-900 border-t border-slate-800">
          {/* Compressed Image Attachment Preview */}
          {attachment && (
            <div className="mb-3 p-2.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={attachment.data_base64}
                  alt={attachment.filename}
                  className="w-12 h-12 object-cover rounded-lg border border-slate-700 shrink-0"
                />
                <div className="min-w-0">
                  <div className="font-medium text-slate-200 truncate">{attachment.filename}</div>
                  <div className="text-[11px] text-emerald-400 flex items-center gap-1.5 mt-0.5">
                    <span>Optimizado WebP: <strong>{formatBytes(attachment.size_bytes)}</strong></span>
                    <span className="text-slate-500">•</span>
                    <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 px-1 rounded">
                      -{attachment.saved_percentage}% LAN
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors"
                title="Quitar adjunto"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {isCompressing && (
            <div className="mb-2 p-2 bg-sky-950/40 border border-sky-800/40 rounded-lg text-xs text-sky-300 flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Optimizando imagen en cliente para ahorrar ancho de banda en la red local...</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={(e) => handleSendMessage(e)} onPaste={handlePaste} className="space-y-3">
            <div className="relative">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Escribe tu comentario detallado o respuesta... (Puedes pegar capturas con Ctrl+V)"
                rows={3}
                className="w-full p-3 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs sm:text-sm placeholder-slate-500 focus:outline-hidden focus:border-sky-500 focus:ring-1 focus:ring-sky-500 resize-none transition-colors"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Attachment Button */}
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileProcess(file);
                    e.target.value = '';
                  }}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs flex items-center gap-1.5 border border-slate-700 transition-colors"
                  title="Adjuntar imagen o captura de pantalla"
                >
                  <Paperclip className="w-4 h-4 text-sky-400" />
                  <span>Adjuntar Imagen</span>
                </button>
                <span className="text-[11px] text-slate-500 hidden sm:inline">
                  (Compresión ligera automática en cliente)
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                {isAdmin && incident.status !== 'resuelta' && (
                  <button
                    type="button"
                    onClick={() => handleSendMessage(undefined, 'resuelta')}
                    disabled={isSending || (!commentText.trim() && !attachment)}
                    className="bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5 shadow transition-colors disabled:opacity-50"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Responder y Resolver</span>
                  </button>
                )}

                <button
                  type="submit"
                  disabled={isSending || (!commentText.trim() && !attachment)}
                  className="bg-sky-600 hover:bg-sky-500 text-white text-xs sm:text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 shadow transition-colors disabled:opacity-50 active:scale-98"
                >
                  <span>{isSending ? 'Enviando a SQLite...' : 'Enviar Mensaje'}</span>
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
