import React, { useEffect, useState } from 'react';
import {
  X,
  Monitor,
  RefreshCw,
  Download,
  Wifi,
  Laptop,
  AlertCircle,
  CheckCircle2,
  Copy,
} from 'lucide-react';
import { ClientMachine, ClientSession, User } from '../types.ts';
import { apiClient } from '../services/apiClient.ts';

interface ClientSessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAdmin: User;
}

const dash = (value: string | null | undefined) => (value && value.trim() ? value : '—');

export const ClientSessionsModal: React.FC<ClientSessionsModalProps> = ({
  isOpen,
  onClose,
  currentAdmin,
}) => {
  const [tab, setTab] = useState<'sessions' | 'machines'>('sessions');
  const [sessions, setSessions] = useState<ClientSession[]>([]);
  const [machines, setMachines] = useState<ClientMachine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessionData, machineData] = await Promise.all([
        apiClient.getSessions(),
        apiClient.getClientMachines(),
      ]);
      setSessions(sessionData);
      setMachines(machineData);
    } catch (err: any) {
      setError(err.message || 'Error al cargar sesiones y equipos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setTab('sessions');
      setError(null);
      setCopied(null);
      load();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const copyValue = async (label: string, value: string | null | undefined) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard can be blocked by the browser; ignore silently.
    }
  };

  const renderCopyable = (label: string, value: string | null | undefined) => {
    if (!value) return <span className="text-slate-500">—</span>;
    return (
      <button
        type="button"
        onClick={() => copyValue(label, value)}
        className="inline-flex items-center gap-1 font-mono text-[11px] text-sky-300 hover:text-sky-200 hover:underline"
        title="Copiar"
      >
        {value}
        {copied === label ? (
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
        ) : (
          <Copy className="w-3 h-3 text-slate-500" />
        )}
      </button>
    );
  };

  const roleBadge = (role: string) => {
    if (role === 'superadmin') {
      return <span className="text-[10px] font-semibold bg-fuchsia-950 text-fuchsia-300 border border-fuchsia-800 px-1.5 py-0.5 rounded">Superadmin</span>;
    }
    if (role === 'admin') {
      return <span className="text-[10px] font-semibold bg-amber-950 text-amber-300 border border-amber-800 px-1.5 py-0.5 rounded">Admin</span>;
    }
    return <span className="text-[10px] font-semibold bg-sky-950 text-sky-300 border border-sky-800 px-1.5 py-0.5 rounded">Usuario</span>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-6xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sky-950/80 border border-sky-800/80 text-sky-400 rounded-lg">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Sesiones y Equipos</h2>
                <span className="text-[10px] font-semibold bg-sky-950 text-sky-300 border border-sky-800 px-2 py-0.2 rounded">
                  Admin IncidenciasTRANS
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Equipos vistos por {currentAdmin.full_name || currentAdmin.username} · Datos de soporte remoto
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={apiClient.getAgentDownloadUrl()}
              download
              className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
              title="Descargar el agente PowerShell para instalar en los PCs"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Descargar agente</span>
            </a>
            <button
              onClick={load}
              disabled={loading}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
              title="Actualizar"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-[11px] text-slate-400 leading-relaxed">
            <strong className="text-slate-200">Cómo obtener usuario y dominio de Windows:</strong> descarga el
            agente y ejecútalo en el PC del usuario con PowerShell. Para que se ejecute en cada inicio de sesión,
            ábrelo con <code className="text-sky-300">-Install</code> (crea una tarea programada). Hasta que se
            ejecute, la aplicación solo puede capturar IP, MAC y nombre de equipo de forma best-effort.
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-slate-800">
            <button
              onClick={() => setTab('sessions')}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
                tab === 'sessions'
                  ? 'border-sky-500 text-sky-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wifi className="w-3.5 h-3.5 inline mr-1.5" />
              Sesiones ({sessions.length})
            </button>
            <button
              onClick={() => setTab('machines')}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
                tab === 'machines'
                  ? 'border-emerald-500 text-emerald-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Laptop className="w-3.5 h-3.5 inline mr-1.5" />
              Equipos registrados ({machines.length})
            </button>
          </div>

          {tab === 'sessions' ? (
            sessions.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                Todavía no hay sesiones registradas.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">Usuario</th>
                      <th className="px-3 py-2 font-medium">Rol</th>
                      <th className="px-3 py-2 font-medium">IP</th>
                      <th className="px-3 py-2 font-medium">MAC</th>
                      <th className="px-3 py-2 font-medium">Equipo</th>
                      <th className="px-3 py-2 font-medium">Usuario Windows</th>
                      <th className="px-3 py-2 font-medium">Dominio</th>
                      <th className="px-3 py-2 font-medium">Origen</th>
                      <th className="px-3 py-2 font-medium">Última actividad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {sessions.map((session) => (
                      <tr key={session.id} className="hover:bg-slate-800/40">
                        <td className="px-3 py-2 font-medium text-slate-200">@{session.username}</td>
                        <td className="px-3 py-2">{roleBadge(session.role)}</td>
                        <td className="px-3 py-2">{renderCopyable(`ip-${session.id}`, session.ip)}</td>
                        <td className="px-3 py-2">{renderCopyable(`mac-${session.id}`, session.mac)}</td>
                        <td className="px-3 py-2 text-slate-300">{dash(session.hostname)}</td>
                        <td className="px-3 py-2 text-slate-300">{dash(session.windows_user)}</td>
                        <td className="px-3 py-2 text-slate-300">{dash(session.windows_domain)}</td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                            session.client_source === 'agent'
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}>
                            {session.client_source === 'agent' ? 'Agente' : 'Servidor'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{session.last_seen_at || session.created_at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : machines.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No hay equipos registrados todavía. Descarga y ejecuta el agente en los PCs.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">Equipo</th>
                    <th className="px-3 py-2 font-medium">IP</th>
                    <th className="px-3 py-2 font-medium">MAC</th>
                    <th className="px-3 py-2 font-medium">Usuario Windows</th>
                    <th className="px-3 py-2 font-medium">Dominio</th>
                    <th className="px-3 py-2 font-medium">Sistema</th>
                    <th className="px-3 py-2 font-medium">Última vez</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {machines.map((machine) => (
                    <tr key={machine.id} className="hover:bg-slate-800/40">
                      <td className="px-3 py-2 font-medium text-slate-200">{dash(machine.hostname)}</td>
                      <td className="px-3 py-2">{renderCopyable(`mip-${machine.id}`, machine.ip)}</td>
                      <td className="px-3 py-2">{renderCopyable(`mmac-${machine.id}`, machine.mac)}</td>
                      <td className="px-3 py-2 text-slate-300">{dash(machine.windows_user)}</td>
                      <td className="px-3 py-2 text-slate-300">{dash(machine.windows_domain)}</td>
                      <td className="px-3 py-2 text-slate-400">{dash(machine.os)}</td>
                      <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{machine.last_seen_at || machine.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
