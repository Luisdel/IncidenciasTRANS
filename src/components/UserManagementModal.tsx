import React, { useState, useEffect } from 'react';
import { 
  X, 
  Users, 
  UserPlus, 
  Shield, 
  User as UserIcon, 
  Edit2, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  Lock, 
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { User } from '../types.ts';
import { apiClient } from '../services/apiClient.ts';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAdmin: User;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({
  isOpen,
  onClose,
  currentAdmin,
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New user form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user');
  const [newFullName, setNewFullName] = useState('');
  const [newDepartment, setNewDepartment] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Editing state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editRole, setEditRole] = useState<'user' | 'admin'>('user');
  const [editPassword, setEditPassword] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getUsers();
      setUsers(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar usuarios de SQLite');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadUsers();
      setShowCreateForm(false);
      setEditingUser(null);
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) {
      setError('El nombre de usuario es obligatorio');
      return;
    }

    if (newRole === 'admin' && (!newPassword || newPassword.length < 4)) {
      setError('Las cuentas de administrador requieren una contraseña de al menos 4 caracteres');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await apiClient.createUser({
        username: newUsername.trim(),
        role: newRole,
        full_name: newFullName.trim() || undefined,
        department: newDepartment.trim() || undefined,
        password: newRole === 'admin' ? newPassword : undefined,
      });

      setSuccessMsg(`Usuario @${newUsername.trim().toLowerCase()} dado de alta correctamente en IncidenciasTRANS`);
      setNewUsername('');
      setNewFullName('');
      setNewDepartment('');
      setNewPassword('');
      setShowCreateForm(false);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Error al crear usuario');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (user: User) => {
    setEditingUser(user);
    setEditFullName(user.full_name || '');
    setEditDepartment(user.department || '');
    setEditRole(user.role);
    setEditPassword('');
    setEditIsActive(user.is_active !== 0);
    setError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await apiClient.updateUser(editingUser.id, {
        full_name: editFullName.trim(),
        department: editDepartment.trim(),
        role: editRole,
        password: editPassword.trim() ? editPassword.trim() : undefined,
        is_active: editIsActive,
      });

      setSuccessMsg(`Usuario @${editingUser.username} actualizado`);
      setEditingUser(null);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Error al actualizar usuario');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (!confirm(`¿Seguro que deseas eliminar definitivamente a @${user.username}?`)) {
      return;
    }

    try {
      await apiClient.deleteUser(user.id);
      setSuccessMsg(`Usuario @${user.username} eliminado del sistema`);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Error al eliminar usuario');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-950/80 border border-amber-800/80 text-amber-400 rounded-lg">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Gestión de Usuarios</h2>
                <span className="text-[10px] font-semibold bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.2 rounded">
                  Admin IncidenciasTRANS
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Alta y administración de cuentas autorizadas para acceder desde la red local
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

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Top action bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-400">
              Usuarios registrados en SQLite: <strong className="text-white">{users.length}</strong>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={loadUsers}
                disabled={loading}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1.5 border border-slate-700"
                title="Actualizar listado"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-400' : ''}`} />
                <span>Refrescar</span>
              </button>

              <button
                onClick={() => {
                  setShowCreateForm(!showCreateForm);
                  setEditingUser(null);
                  setError(null);
                }}
                className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-3 py-2 rounded-lg shadow flex items-center gap-1.5 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                <span>{showCreateForm ? 'Cerrar Formulario' : 'Dar de Alta Usuario / Admin'}</span>
              </button>
            </div>
          </div>

          {/* Create User Form */}
          {showCreateForm && (
            <form onSubmit={handleCreateUser} className="bg-slate-950 border border-amber-900/40 rounded-xl p-4 space-y-3 animate-in fade-in duration-150">
              <h3 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4" />
                <span>Dar de Alta Nueva Cuenta</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Nombre de usuario (login) <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="ej. alberto, carmen, logistica01"
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-hidden focus:border-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Tipo de Cuenta / Rol <span className="text-amber-400">*</span>
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as 'user' | 'admin')}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-hidden focus:border-amber-500"
                  >
                    <option value="user">Usuario Estándar (Sin contraseña)</option>
                    <option value="admin">Administrador (Requiere contraseña)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Nombre Completo (Opcional)
                  </label>
                  <input
                    type="text"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    placeholder="ej. Alberto González"
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-hidden focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Departamento o Ubicación
                  </label>
                  <input
                    type="text"
                    value={newDepartment}
                    onChange={(e) => setNewDepartment(e.target.value)}
                    placeholder="ej. Muelle 4, Oficina Central"
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-hidden focus:border-amber-500"
                  />
                </div>

                {newRole === 'admin' && (
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-medium text-amber-300 mb-1 flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      <span>Contraseña de Administrador <span className="text-amber-400">*</span></span>
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 4 caracteres"
                      className="w-full px-3 py-1.5 bg-slate-900 border border-amber-800 rounded-lg text-white text-xs focus:outline-hidden focus:border-amber-500"
                      required
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg shadow disabled:opacity-50"
                >
                  {isSubmitting ? 'Guardando en SQLite...' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          )}

          {/* Edit User Form Modal/Banner */}
          {editingUser && (
            <form onSubmit={handleSaveEdit} className="bg-slate-950 border border-sky-800/80 rounded-xl p-4 space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                  <Edit2 className="w-4 h-4" />
                  <span>Modificar Usuario: @{editingUser.username}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Cerrar edición
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Nombre Completo
                  </label>
                  <input
                    type="text"
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-hidden focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Departamento
                  </label>
                  <input
                    type="text"
                    value={editDepartment}
                    onChange={(e) => setEditDepartment(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-hidden focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Rol
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as 'user' | 'admin')}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-hidden focus:border-sky-500"
                  >
                    <option value="user">Usuario Estándar</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Estado de la Cuenta
                  </label>
                  <select
                    value={editIsActive ? '1' : '0'}
                    onChange={(e) => setEditIsActive(e.target.value === '1')}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-hidden focus:border-sky-500"
                  >
                    <option value="1">Activo (Puede acceder)</option>
                    <option value="0">Desactivado (Bloqueado)</option>
                  </select>
                </div>

                {editRole === 'admin' && (
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Nueva Contraseña (dejar en blanco para mantener la actual)
                    </label>
                    <input
                      type="password"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      placeholder="Escribe una nueva contraseña si deseas cambiarla..."
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-hidden focus:border-sky-500"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg shadow disabled:opacity-50"
                >
                  {isSubmitting ? 'Actualizando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          )}

          {/* Users Table */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900/80 border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 px-4 font-semibold">Usuario</th>
                  <th className="py-2.5 px-3 font-semibold">Nombre / Depto</th>
                  <th className="py-2.5 px-3 font-semibold">Rol</th>
                  <th className="py-2.5 px-3 font-semibold">Estado</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Incidencias</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {users.map((u) => {
                  const isAdmin = u.role === 'admin';
                  const isActive = u.is_active !== 0;
                  const isCurrent = currentAdmin.id === u.id || currentAdmin.username === u.username;

                  return (
                    <tr key={u.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded flex items-center justify-center font-bold text-[11px] ${
                            isAdmin ? 'bg-amber-950 text-amber-400 border border-amber-800' : 'bg-slate-800 text-sky-400 border border-slate-700'
                          }`}>
                            {isAdmin ? <Shield className="w-3.5 h-3.5" /> : <UserIcon className="w-3.5 h-3.5" />}
                          </div>
                          <div>
                            <span className="font-mono font-semibold text-white">@{u.username}</span>
                            {isCurrent && (
                              <span className="ml-1.5 text-[10px] text-amber-400 font-medium">(Tú)</span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-slate-300">
                        <div>{u.full_name || '—'}</div>
                        <div className="text-[11px] text-slate-500">{u.department || 'General'}</div>
                      </td>

                      <td className="py-2.5 px-3">
                        {isAdmin ? (
                          <span className="bg-amber-950 text-amber-400 border border-amber-800 text-[10px] px-2 py-0.5 rounded font-medium">
                            Administrador
                          </span>
                        ) : (
                          <span className="bg-sky-950 text-sky-400 border border-sky-800 text-[10px] px-2 py-0.5 rounded font-medium">
                            Usuario LAN
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3">
                        {isActive ? (
                          <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                            <CheckCircle className="w-3 h-3" /> Activo
                          </span>
                        ) : (
                          <span className="text-slate-500 flex items-center gap-1 text-[11px]">
                            <XCircle className="w-3 h-3" /> Inactivo
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono text-slate-400">
                        {(u as any).incident_count ?? 0}
                      </td>

                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleStartEdit(u)}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                            title="Editar usuario"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {!isCurrent && (
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                              title="Eliminar usuario"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>* Los usuarios estándar acceden con su login sin contraseña desde puestos de la red.</span>
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
