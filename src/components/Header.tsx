import React, { useEffect, useState } from 'react';
import { 
  Server, 
  User as UserIcon, 
  Shield, 
  PlusCircle, 
  Activity, 
  LogOut, 
  Network, 
  Zap,
  HardDrive,
  Users
} from 'lucide-react';
import { User } from '../types.ts';
import { networkStats, subscribeNetworkStats } from '../services/apiClient.ts';
import { formatBytes } from '../utils/imageCompressor.ts';
import { NotificationCenter } from './NotificationCenter.tsx';

interface HeaderProps {
  currentUser: User | null;
  onOpenNewIncident: () => void;
  onOpenServerModal: () => void;
  onOpenUserManagement: () => void;
  onSwitchUser: () => void;
  onSelectIncident: (id: number) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onOpenNewIncident,
  onOpenServerModal,
  onOpenUserManagement,
  onSwitchUser,
  onSelectIncident,
}) => {
  const [, setTick] = useState(0);

  useEffect(() => {
    return subscribeNetworkStats(() => {
      setTick(t => t + 1);
    });
  }, []);

  const totalTransfer = networkStats.bytesSent + networkStats.bytesReceived;
  const isAdmin = currentUser?.role === 'admin';

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 sticky top-0 z-40 shadow-md">
      {/* Top Banner: Local Network & Server Status */}
      <div className="bg-slate-950/80 px-4 py-1 text-xs border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-slate-400">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Red Local Privada (LAN)
          </span>
          <span className="hidden sm:inline text-slate-500">|</span>
          <span className="flex items-center gap-1 text-slate-300">
            <Server className="w-3.5 h-3.5 text-sky-400" />
            Servidor: <strong className="text-white font-mono">IncidenciasTRANS</strong> (Linux / SQLite)
          </span>
        </div>

        <div className="flex items-center gap-4 text-[11px]">
          <div className="flex items-center gap-1 text-slate-400" title="Consumo de ancho de banda en esta sesión">
            <Zap className="w-3 h-3 text-amber-400" />
            <span>Tráfico LAN: <strong className="text-slate-200">{formatBytes(totalTransfer)}</strong></span>
          </div>

          <div className="flex items-center gap-1 text-slate-400">
            <Activity className="w-3 h-3 text-emerald-400" />
            <span>Latencia: <strong className="text-slate-200">{networkStats.lastLatencyMs || 8} ms</strong></span>
          </div>

          <button
            onClick={onOpenServerModal}
            className="flex items-center gap-1 text-sky-400 hover:text-sky-300 hover:underline cursor-pointer"
          >
            <HardDrive className="w-3 h-3" />
            <span>Info Servidor &amp; SQLite</span>
          </button>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
        {/* Branding */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-sky-600 flex items-center justify-center text-white font-bold shadow-sm ring-1 ring-white/10">
            IT
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">
                ClienteINCIDENCIAS
              </h1>
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-sky-950 text-sky-300 border border-sky-800/80 px-2 py-0.5 rounded">
                v2.4 LAN
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Gestor de soporte e incidencias conectado a <span className="text-slate-300 font-medium">IncidenciasTRANS</span>
            </p>
          </div>
        </div>

        {/* Right action controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Admin User Management Button */}
          {isAdmin && (
            <button
              onClick={onOpenUserManagement}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-900/60 text-xs sm:text-sm font-medium px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg shadow-xs transition-colors"
              title="Gestión de usuarios y administradores"
            >
              <Users className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Usuarios</span>
            </button>
          )}

          {/* New Incident Button */}
          {currentUser && (
            <button
              onClick={onOpenNewIncident}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-medium px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg shadow transition-colors active:scale-98"
            >
              <PlusCircle className="w-4 h-4" />
              <span className="hidden xs:inline">Nueva Incidencia</span>
              <span className="xs:hidden">Crear</span>
            </button>
          )}

          {/* Real-time Notification Center */}
          {currentUser && (
            <NotificationCenter
              currentUser={currentUser}
              onSelectIncident={onSelectIncident}
            />
          )}

          {currentUser ? (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-700">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold text-white flex items-center justify-end gap-1">
                  {currentUser.role === 'admin' ? (
                    <Shield className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <UserIcon className="w-3.5 h-3.5 text-sky-400" />
                  )}
                  {currentUser.full_name || currentUser.username}
                </div>
                <div className="text-[11px] text-slate-400">
                  {currentUser.role === 'admin' ? (
                    <span className="text-amber-400 font-medium">Administrador</span>
                  ) : (
                    <span>{currentUser.department || 'Usuario LAN'}</span>
                  )}
                </div>
              </div>

              <button
                onClick={onSwitchUser}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-xs flex items-center gap-1"
                title="Cambiar usuario o cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden md:inline">Salir</span>
              </button>
            </div>
          ) : (
            <button
              onClick={onSwitchUser}
              className="bg-sky-600 hover:bg-sky-500 text-white text-xs sm:text-sm font-medium px-3.5 py-1.5 rounded-lg shadow transition-colors"
            >
              Iniciar Sesión
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
