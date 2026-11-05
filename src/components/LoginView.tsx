import React, { useState } from 'react';
import { User, Shield, Lock, ArrowRight, Server, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiClient } from '../services/apiClient.ts';
import { User as UserType } from '../types.ts';

interface LoginViewProps {
  onSuccess: (user: UserType, token: string) => void;
  onCancel?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSuccess, onCancel }) => {
  const [activeTab, setActiveTab] = useState<'user' | 'admin'>('user');
  
  // User login state (No password required, as requested)
  const [username, setUsername] = useState('luis');
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('Logística');
  
  // Admin login state (Requires password)
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('admin123');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUserLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Por favor indica un identificador de usuario');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.loginUser(username.trim(), fullName.trim(), department.trim());
      onSuccess(res.user, res.token);
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesion como usuario');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUsername.trim() || !adminPassword) {
      setError('Introduce usuario y contrasena de administrador');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.loginAdmin(adminUsername.trim(), adminPassword);
      onSuccess(res.user, res.token);
    } catch (err: any) {
      setError(err.message || 'Credenciales de administrador incorrectas');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Banner */}
        <div className="bg-slate-950 px-6 py-5 border-b border-slate-800 text-center">
          <div className="inline-flex p-3 rounded-xl bg-sky-950/80 border border-sky-800/60 text-sky-400 mb-3 shadow-inner">
            <Server className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Acceso a la Red Corporativa
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Servidor físico <span className="text-sky-300 font-mono">IncidenciasTRANS</span> | Cliente <span className="text-white font-mono">ClienteINCIDENCIAS</span>
          </p>
        </div>

        {/* Tab switch */}
        <div className="grid grid-cols-2 p-1.5 bg-slate-950/60 border-b border-slate-800 text-sm font-medium">
          <button
            type="button"
            onClick={() => { setActiveTab('user'); setError(null); }}
            className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all ${
              activeTab === 'user'
                ? 'bg-slate-800 text-sky-400 shadow-xs font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Usuario</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('admin'); setError(null); }}
            className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all ${
              activeTab === 'admin'
                ? 'bg-slate-800 text-amber-400 shadow-xs font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Admin / Superadmin</span>
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-red-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'user' ? (
            <form onSubmit={handleUserLogin} className="space-y-4">
              <div className="p-3 bg-sky-950/30 border border-sky-900/50 rounded-xl text-xs text-sky-300/90 leading-relaxed">
                💡 <strong>Acceso ágil sin contraseña:</strong> Si tu identificador no existe todavía, se crea automáticamente como usuario estándar con el nombre y departamento que indiques. El administrador podrá modificarlo después.
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Identificador de usuario (login) <span className="text-sky-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 text-sm">
                    @
                  </span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="ej. luis, maria..."
                    className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm focus:outline-hidden focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Nombre completo
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="ej. Luis Martínez"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm focus:outline-hidden focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Departamento
                  </label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="ej. Logística"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm focus:outline-hidden focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
                  />
                </div>
              </div>

              {/* Quick Preset Buttons for pre-seeded users */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="text-[11px] text-slate-500">Usuarios en SQLite:</span>
                <button
                  type="button"
                  onClick={() => setUsername('luis')}
                  className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-[11px]"
                >
                  @luis
                </button>
                <button
                  type="button"
                  onClick={() => setUsername('maria')}
                  className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-[11px]"
                >
                  @maria
                </button>
              </div>

              <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-lg text-[11px] text-slate-400">
                ¿No estás dado de alta? No pasa nada: al entrar se crea tu cuenta de usuario automáticamente. Un <button type="button" onClick={() => setActiveTab('admin')} className="text-amber-400 underline hover:text-amber-300">administrador</button> podrá modificar tus datos, desactivarte o borrarte desde el panel de gestión.
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 py-2.5 px-4 bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm rounded-lg shadow flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Conectando con IncidenciasTRANS...' : 'Entrar a ClienteINCIDENCIAS'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div className="p-3 bg-amber-950/30 border border-amber-900/50 rounded-xl text-xs text-amber-300/90 leading-relaxed">
                🛡️ <strong>Panel de Administrador:</strong> Permite gestionar usuarios, autoasignarse incidencias de la cola de trabajo, cambiar estados y resolverlas. El <strong>superadmin</strong> además dispone de la zona peligrosa para vaciar la base de datos.
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Usuario Administrador
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 text-sm">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Contraseña de Administrador
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 text-sm">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    required
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Clave por defecto preconfigurada en SQLite: <code className="text-amber-400 bg-slate-950 px-1.5 py-0.5 rounded">admin123</code>
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white font-medium text-sm rounded-lg shadow flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Verificando con SQLite...' : 'Acceder al Panel Admin'}
                <Shield className="w-4 h-4" />
              </button>
            </form>
          )}

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-full mt-3 text-xs text-slate-500 hover:text-slate-300 py-1 transition-colors"
            >
              Continuar como invitado / Cancelar
            </button>
          )}
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 bg-slate-950/70 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Base de datos SQLite local
          </span>
          <span>Sin dependencias de internet</span>
        </div>
      </div>
    </div>
  );
};
