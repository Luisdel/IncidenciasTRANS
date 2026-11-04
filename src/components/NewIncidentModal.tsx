import React, { useState, useRef } from 'react';
import { 
  X, 
  PlusCircle, 
  Paperclip, 
  Cpu, 
  Wifi, 
  Key, 
  Package, 
  HelpCircle, 
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { User, IncidentCategory, IncidentPriority } from '../types.ts';
import { apiClient } from '../services/apiClient.ts';
import { compressImage, formatBytes, CompressionResult } from '../utils/imageCompressor.ts';

interface NewIncidentModalProps {
  isOpen: boolean;
  currentUser: User | null;
  onClose: () => void;
  onCreated: (incidentId: number) => void;
}

export const NewIncidentModal: React.FC<NewIncidentModalProps> = ({
  isOpen,
  currentUser,
  onClose,
  onCreated,
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<IncidentCategory>('hardware');
  const [priority, setPriority] = useState<IncidentPriority>('media');
  const [description, setDescription] = useState('');
  const [attachment, setAttachment] = useState<CompressionResult | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileProcess = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona una imagen válida');
      return;
    }
    setIsCompressing(true);
    try {
      const compressed = await compressImage(file, 1280, 0.78);
      setAttachment(compressed);
    } catch (err: any) {
      alert('Error al comprimir: ' + err.message);
    } finally {
      setIsCompressing(false);
    }
  };

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError('Por favor completa el título y la descripción detallada');
      return;
    }

    if (!currentUser) {
      setError('Debes estar autenticado para abrir incidencias');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await apiClient.createIncident({
        title: title.trim(),
        description: description.trim(),
        category,
        priority,
        creator_username: currentUser.username,
        attachment: attachment
          ? {
              filename: attachment.filename,
              mime_type: attachment.mime_type,
              data_base64: attachment.data_base64,
              size_bytes: attachment.size_bytes,
            }
          : undefined,
      });

      // Reset
      setTitle('');
      setDescription('');
      setAttachment(null);
      onCreated(res.incidentId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al registrar la incidencia en el servidor IncidenciasTRANS');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div 
        onPaste={handlePaste}
        className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 rounded-lg">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Nueva Incidencia</h2>
              <p className="text-xs text-slate-400">
                Se enviará al servidor <span className="text-sky-300 font-mono">IncidenciasTRANS</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Author Badge */}
          <div className="flex items-center justify-between text-xs bg-slate-950/80 px-3 py-2 rounded-lg border border-slate-800 text-slate-400">
            <span>Remitente: <strong className="text-white">@{currentUser?.username}</strong> {currentUser?.department ? `(${currentUser.department})` : ''}</span>
            <span className="text-emerald-400 font-mono">Red Local LAN</span>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Título o Asunto de la Incidencia <span className="text-sky-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ej. Impresora de albaranes atascada en muelle 2..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm focus:outline-hidden focus:border-sky-500"
              required
            />
          </div>

          {/* Category & Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Categoría
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as IncidentCategory)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs focus:outline-hidden focus:border-sky-500"
              >
                <option value="hardware">Hardware (Lector, Impresora, PC)</option>
                <option value="software">Software (App, Errores)</option>
                <option value="red">Red / Conectividad LAN</option>
                <option value="acceso">Acceso y Permisos</option>
                <option value="general">General</option>
                <option value="otros">Otros</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Prioridad
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as IncidentPriority)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs focus:outline-hidden focus:border-sky-500"
              >
                <option value="baja">Baja</option>
                <option value="media">Media (Estándar)</option>
                <option value="alta">Alta (Afecta operaciones)</option>
                <option value="critica">Crítica (Muelle / Línea parada)</option>
              </select>
            </div>
          </div>

          {/* Detailed Description */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Descripción Detallada <span className="text-sky-400">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalla lo que ha ocurrido, número de equipo, mensajes de error o pasos para reproducirlo..."
              rows={4}
              className="w-full p-3 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs sm:text-sm placeholder-slate-500 focus:outline-hidden focus:border-sky-500 resize-none"
              required
            />
          </div>

          {/* Attachment Box */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Adjuntar Imagen o Captura (Opcional)
            </label>

            {attachment ? (
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={attachment.data_base64}
                    alt={attachment.filename}
                    className="w-14 h-14 object-cover rounded-lg border border-slate-700 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-200 truncate">{attachment.filename}</p>
                    <p className="text-[11px] text-emerald-400 mt-0.5">
                      Tamaño reducido: <strong>{formatBytes(attachment.size_bytes)}</strong> (-{attachment.saved_percentage}% LAN)
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-sky-500/80 rounded-xl p-4 text-center cursor-pointer bg-slate-950/40 hover:bg-slate-950 transition-colors"
              >
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
                <Paperclip className="w-5 h-5 text-sky-400 mx-auto mb-1.5" />
                <p className="text-xs text-slate-300 font-medium">
                  Haz clic para seleccionar o arrastra una imagen aquí
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  También puedes pegar directamente capturas del portapapeles con <kbd className="px-1 bg-slate-800 rounded">Ctrl+V</kbd>
                </p>
              </div>
            )}

            {isCompressing && (
              <p className="text-xs text-sky-400 mt-2 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Comprimiendo imagen en el cliente para bajo consumo de ancho de banda...
              </p>
            )}
          </div>

          {/* Footer Submit */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg transition-colors"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isSubmitting || isCompressing}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold rounded-lg shadow flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Registrando en SQLite...' : 'Registrar Incidencia'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
