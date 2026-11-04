import React from 'react';
import { X, Download, FileImage } from 'lucide-react';
import { formatBytes } from '../utils/imageCompressor.ts';

interface ImageViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  filename: string;
  sizeBytes?: number;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  filename,
  sizeBytes,
}) => {
  if (!isOpen) return null;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = filename || 'incidencia-captura.webp';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative max-w-5xl w-full max-h-[90vh] bg-slate-900 border border-slate-700 rounded-xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700 text-slate-200">
          <div className="flex items-center gap-2 text-sm font-medium truncate">
            <FileImage className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="truncate">{filename}</span>
            {sizeBytes ? (
              <span className="text-xs text-slate-400 bg-slate-700/60 px-2 py-0.5 rounded">
                {formatBytes(sizeBytes)}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5 text-xs"
              title="Descargar imagen"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Descargar</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              title="Cerrar (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Image Preview Container */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950 min-h-[300px]">
          <img
            src={imageUrl}
            alt={filename}
            className="max-h-[75vh] max-w-full object-contain rounded border border-slate-800 shadow"
          />
        </div>
      </div>
    </div>
  );
};
