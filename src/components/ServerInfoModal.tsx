import React, { useEffect, useState } from 'react';
import { 
  X, 
  Server, 
  Database, 
  HardDrive, 
  Terminal, 
  CheckCircle2, 
  Zap, 
  Copy, 
  Check, 
  Layers, 
  Activity, 
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { ServerStats } from '../types.ts';
import { apiClient, networkStats } from '../services/apiClient.ts';
import { formatBytes } from '../utils/imageCompressor.ts';

interface ServerInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ServerInfoModal: React.FC<ServerInfoModalProps> = ({ isOpen, onClose }) => {
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'status' | 'linux' | 'sqlite'>('status');

  const fetchStats = async () => {
    setLoading(true);
    try {
      const data = await apiClient.getServerStats();
      setStats(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStats();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const systemdService = `[Unit]
Description=Servicio HTTP IncidenciasTRANS (Red Local Privada)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/incidencias-trans
ExecStart=/usr/bin/node /opt/incidencias-trans/server.ts
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target`;

  const nginxConfig = `server {
    listen 80;
    server_name incidencias.empresa.local 192.168.1.100;

    # Acceso exclusivo para la red corporativa interna
    allow 192.168.0.0/16;
    allow 10.0.0.0/8;
    deny all;

    client_max_body_size 12M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sky-950/80 border border-sky-800/80 text-sky-400 rounded-lg">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Servidor IncidenciasTRANS</h2>
                <span className="text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.2 rounded">
                  Activo
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Arquitectura de red privada local LAN y base de datos SQLite
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

        {/* Tab switch */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 text-xs font-medium px-6 gap-4">
          <button
            onClick={() => setActiveTab('status')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'status'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Métricas &amp; SQLite</span>
          </button>

          <button
            onClick={() => setActiveTab('linux')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'linux'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>Despliegue Linux On-Premise</span>
          </button>

          <button
            onClick={() => setActiveTab('sqlite')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'sqlite'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Rendimiento y Copias</span>
          </button>
        </div>

        {/* Body content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-300 flex-1">
          {activeTab === 'status' && (
            <>
              {/* SQLite stats cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-[11px] text-slate-500">Base de Datos</div>
                  <div className="text-sm font-bold text-white font-mono mt-0.5">SQLite 3</div>
                  <div className="text-[10px] text-emerald-400 font-semibold mt-1">Modo WAL activo</div>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-[11px] text-slate-500">Tamaño Fichero DB</div>
                  <div className="text-sm font-bold text-white font-mono mt-0.5">
                    {stats?.dbSizeFormatted || 'Cargando...'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">Fichero local disco</div>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-[11px] text-slate-500">Incidencias Totales</div>
                  <div className="text-sm font-bold text-white font-mono mt-0.5">
                    {stats?.counts.incidents ?? 0}
                  </div>
                  <div className="text-[10px] text-amber-400 mt-1">
                    {stats?.counts.openIncidents ?? 0} abiertas
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-[11px] text-slate-500">Tráfico Sesión LAN</div>
                  <div className="text-sm font-bold text-emerald-400 font-mono mt-0.5">
                    {formatBytes(networkStats.bytesSent + networkStats.bytesReceived)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">Bajo ancho de banda</div>
                </div>
              </div>

              {/* Server Engine Info */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                <h4 className="text-xs font-semibold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-400" />
                  <span>Configuración del Host Privado</span>
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div>
                    <span className="text-slate-500">Servidor HTTP:</span>{' '}
                    <span className="text-slate-200 font-mono">Express en Node.js {stats?.nodeVersion || ''}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Sistema Operativo:</span>{' '}
                    <span className="text-slate-200 font-mono capitalize">{stats?.platform === 'linux' ? 'Linux Server' : stats?.platform}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Fichero SQLite:</span>{' '}
                    <span className="text-slate-200 font-mono text-[11px]">/data/incidencias.db</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Uptime Proceso:</span>{' '}
                    <span className="text-slate-200 font-mono">{stats?.uptimeSeconds ?? 0} segundos</span>
                  </div>
                </div>
              </div>

              {/* Bandwidth optimization summary */}
              <div className="p-3.5 bg-emerald-950/40 border border-emerald-900/60 rounded-xl text-xs space-y-1.5">
                <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Optimización de Ancho de Banda en Red Local</span>
                </div>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  Las capturas e imágenes se redimensionan y comprimen en formato WebP en el propio navegador del cliente antes de enviarse a través del cable o Wi-Fi corporativo. Esto reduce transferencias típicas de 4 MB a solo 50-80 KB (más del 95% de ahorro de red).
                </p>
              </div>
            </>
          )}

          {activeTab === 'linux' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-300">
                Para alojar <strong>IncidenciasTRANS</strong> en una máquina física Linux (ej. Ubuntu Server, Debian o RedHat) en la red corporativa interna:
              </p>

              {/* Systemd service file */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-mono text-sky-400">/etc/systemd/system/incidencias-trans.service</span>
                  <button
                    onClick={() => copyToClipboard(systemdService, 'systemd')}
                    className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                  >
                    {copiedCode === 'systemd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode === 'systemd' ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
                <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono text-[11px] text-slate-300 overflow-x-auto">
                  {systemdService}
                </pre>
              </div>

              {/* Nginx reverse proxy configuration */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-mono text-sky-400">/etc/nginx/sites-available/incidencias (Opcional Proxy LAN)</span>
                  <button
                    onClick={() => copyToClipboard(nginxConfig, 'nginx')}
                    className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                  >
                    {copiedCode === 'nginx' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode === 'nginx' ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
                <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono text-[11px] text-slate-300 overflow-x-auto">
                  {nginxConfig}
                </pre>
              </div>

              {/* Startup commands */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 space-y-1">
                <div className="text-slate-500"># Comandos para habilitar e iniciar el servicio en Linux:</div>
                <div>sudo systemctl daemon-reload</div>
                <div>sudo systemctl enable incidencias-trans</div>
                <div>sudo systemctl start incidencias-trans</div>
              </div>
            </div>
          )}

          {activeTab === 'sqlite' && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <h4 className="font-semibold text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span>Por qué SQLite en Servidor Físico IncidenciasTRANS</span>
                </h4>
                <ul className="list-disc list-inside space-y-1.5 text-slate-300 text-[11px] leading-relaxed">
                  <li><strong>Zero Latencia de Red Interna de BD:</strong> Las consultas no hacen saltos de red adicionales entre la BD y la API.</li>
                  <li><strong>Modo WAL (Write-Ahead Logging):</strong> Permite lecturas y escrituras concurrentes sin bloqueos de tabla.</li>
                  <li><strong>Índices B-Tree optimizados:</strong> Consultas indexadas por estado, usuario creador y fecha en menos de 2 milisegundos.</li>
                  <li><strong>Un único fichero portable:</strong> Todo el histórico reside en <code>data/incidencias.db</code>, facilitando copias de seguridad inmediatas sin detener el servicio.</li>
                </ul>
              </div>

              {/* Backup commands */}
              <div>
                <div className="text-[11px] font-mono text-sky-400 mb-1">Copia de Seguridad en Caliente (Hot Backup)</div>
                <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono text-[11px] text-slate-300 overflow-x-auto">
{`# Backup seguro sin bloquear la base de datos:
sqlite3 /opt/incidencias-trans/data/incidencias.db ".backup '/copias/incidencias_$(date +%Y%m%d).db'"`}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs">
          <button
            onClick={fetchStats}
            disabled={loading}
            className="text-slate-400 hover:text-white flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-400' : ''}`} />
            <span>Refrescar métricas</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
