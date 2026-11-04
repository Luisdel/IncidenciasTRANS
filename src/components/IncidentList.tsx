import React, { useState } from 'react';
import { 
  Incident, 
  IncidentStatus, 
  IncidentPriority, 
  IncidentCategory, 
  User 
} from '../types.ts';
import { 
  Search, 
  MessageSquare, 
  Image as ImageIcon, 
  Clock, 
  UserCheck, 
  AlertTriangle, 
  Filter, 
  ChevronRight, 
  Plus, 
  Cpu, 
  Wifi, 
  Key, 
  Package, 
  HelpCircle,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';

interface IncidentListProps {
  incidents: Incident[];
  currentUser: User | null;
  onSelectIncident: (id: number) => void;
  onOpenNewIncident: () => void;
  onQuickAssign: (id: number) => Promise<void>;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export const IncidentList: React.FC<IncidentListProps> = ({
  incidents,
  currentUser,
  onSelectIncident,
  onOpenNewIncident,
  onQuickAssign,
  onRefresh,
  isRefreshing = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [categoryFilter, setCategoryFilter] = useState<string>('todos');
  const [priorityFilter, setPriorityFilter] = useState<string>('todos');
  const [adminViewTab, setAdminViewTab] = useState<'all' | 'unassigned' | 'mine'>('all');

  const isAdmin = currentUser?.role === 'admin';

  // Filtered incidents
  const filtered = incidents.filter(inc => {
    // Admin tabs
    if (isAdmin) {
      if (adminViewTab === 'unassigned' && inc.assigned_admin_username) return false;
      if (adminViewTab === 'mine' && inc.assigned_admin_username !== currentUser.username) return false;
    }

    // Status filter
    if (statusFilter !== 'todos' && inc.status !== statusFilter) return false;

    // Category filter
    if (categoryFilter !== 'todos' && inc.category !== categoryFilter) return false;

    // Priority filter
    if (priorityFilter !== 'todos' && inc.priority !== priorityFilter) return false;

    // Search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchCode = inc.code?.toLowerCase().includes(term);
      const matchTitle = inc.title?.toLowerCase().includes(term);
      const matchDesc = inc.description?.toLowerCase().includes(term);
      const matchCreator = inc.creator_username?.toLowerCase().includes(term) || inc.creator_name?.toLowerCase().includes(term);
      const matchAdmin = inc.assigned_admin_username?.toLowerCase().includes(term);
      if (!matchCode && !matchTitle && !matchDesc && !matchCreator && !matchAdmin) {
        return false;
      }
    }

    return true;
  });

  const unassignedCount = incidents.filter(i => !i.assigned_admin_username && i.status === 'abierta').length;
  const myAssignedCount = isAdmin ? incidents.filter(i => i.assigned_admin_username === currentUser?.username && i.status !== 'cerrada').length : 0;

  const getStatusBadge = (status: IncidentStatus) => {
    switch (status) {
      case 'abierta':
        return <span className="bg-sky-950 text-sky-400 border border-sky-800 text-xs px-2.5 py-0.5 rounded-full font-medium">Abierta</span>;
      case 'en_progreso':
        return <span className="bg-amber-950 text-amber-400 border border-amber-800 text-xs px-2.5 py-0.5 rounded-full font-medium">En Curso</span>;
      case 'resuelta':
        return <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-medium">Resuelta</span>;
      case 'cerrada':
        return <span className="bg-slate-800 text-slate-400 border border-slate-700 text-xs px-2.5 py-0.5 rounded-full font-medium">Cerrada</span>;
    }
  };

  const getPriorityBadge = (priority: IncidentPriority) => {
    switch (priority) {
      case 'critica':
        return <span className="text-red-400 bg-red-950/70 border border-red-800/80 text-[11px] px-2 py-0.5 rounded font-semibold uppercase">Crítica</span>;
      case 'alta':
        return <span className="text-orange-400 bg-orange-950/70 border border-orange-800/80 text-[11px] px-2 py-0.5 rounded font-medium">Alta</span>;
      case 'media':
        return <span className="text-yellow-400 bg-yellow-950/60 border border-yellow-800/60 text-[11px] px-2 py-0.5 rounded font-medium">Media</span>;
      case 'baja':
        return <span className="text-slate-400 bg-slate-800 border border-slate-700 text-[11px] px-2 py-0.5 rounded">Baja</span>;
    }
  };

  const getCategoryIcon = (category: IncidentCategory) => {
    switch (category) {
      case 'hardware': return <Cpu className="w-3.5 h-3.5 text-blue-400" />;
      case 'red': return <Wifi className="w-3.5 h-3.5 text-cyan-400" />;
      case 'acceso': return <Key className="w-3.5 h-3.5 text-purple-400" />;
      case 'software': return <Package className="w-3.5 h-3.5 text-emerald-400" />;
      default: return <HelpCircle className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner / Triage Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>{isAdmin ? 'Cola Global de Incidencias' : 'Mis Incidencias'}</span>
            <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono">
              {filtered.length} {filtered.length === 1 ? 'incidencia' : 'incidencias'}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {isAdmin 
              ? 'Panel de administración IncidenciasTRANS: asigna y gestiona todos los tickets de la red'
              : `Incidencias registradas por tu usuario (@${currentUser?.username || ''}) en la red corporativa`
            }
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1.5 transition-colors border border-slate-700"
            title="Refrescar datos desde SQLite"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>

          <button
            onClick={onOpenNewIncident}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Crear Incidencia</span>
          </button>
        </div>
      </div>

      {/* Admin Quick Triage Tabs */}
      {isAdmin && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <button
            onClick={() => setAdminViewTab('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 shrink-0 ${
              adminViewTab === 'all'
                ? 'bg-slate-800 text-white border border-slate-700 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span>Todas</span>
            <span className="text-[11px] bg-slate-700 text-slate-300 px-1.5 rounded-full">
              {incidents.length}
            </span>
          </button>

          <button
            onClick={() => setAdminViewTab('unassigned')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 shrink-0 ${
              adminViewTab === 'unassigned'
                ? 'bg-amber-950 text-amber-300 border border-amber-800 shadow-xs'
                : 'text-slate-400 hover:text-amber-300 hover:bg-slate-900'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Sin Asignar</span>
            {unassignedCount > 0 && (
              <span className="text-[11px] bg-amber-600 text-white px-1.5 py-0.2 rounded-full font-bold">
                {unassignedCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setAdminViewTab('mine')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 shrink-0 ${
              adminViewTab === 'mine'
                ? 'bg-sky-950 text-sky-300 border border-sky-800 shadow-xs'
                : 'text-slate-400 hover:text-sky-300 hover:bg-slate-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
            <span>Asignadas a mí</span>
            {myAssignedCount > 0 && (
              <span className="text-[11px] bg-sky-600 text-white px-1.5 py-0.2 rounded-full font-bold">
                {myAssignedCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Filters & Search Control */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center gap-3 text-xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por código, título, usuario o descripción..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-hidden focus:border-sky-500 text-xs"
          />
        </div>

        {/* Status dropdown */}
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-300 focus:outline-hidden focus:border-sky-500 text-xs"
          >
            <option value="todos">Estado: Todos</option>
            <option value="abierta">Abierta</option>
            <option value="en_progreso">En Curso</option>
            <option value="resuelta">Resuelta</option>
            <option value="cerrada">Cerrada</option>
          </select>
        </div>

        {/* Category dropdown */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-300 focus:outline-hidden focus:border-sky-500 text-xs"
        >
          <option value="todos">Categoría: Todas</option>
          <option value="hardware">Hardware</option>
          <option value="software">Software</option>
          <option value="red">Red / LAN</option>
          <option value="acceso">Acceso / Claves</option>
          <option value="general">General</option>
          <option value="otros">Otros</option>
        </select>

        {/* Priority dropdown */}
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-300 focus:outline-hidden focus:border-sky-500 text-xs"
        >
          <option value="todos">Prioridad: Todas</option>
          <option value="critica">Crítica</option>
          <option value="alta">Alta</option>
          <option value="media">Media</option>
          <option value="baja">Baja</option>
        </select>
      </div>

      {/* Incidents List Grid */}
      {filtered.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-500 flex items-center justify-center mx-auto mb-3">
            <Package className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-white">No se encontraron incidencias</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            No hay registros en SQLite que coincidan con los filtros aplicados.
          </p>
          <button
            onClick={onOpenNewIncident}
            className="mt-4 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-lg inline-flex items-center gap-1.5 shadow transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Crear Nueva Incidencia
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((inc) => {
            const isUnassigned = !inc.assigned_admin_username;
            const isAssignedToMe = isAdmin && inc.assigned_admin_username === currentUser?.username;

            return (
              <div
                key={inc.id}
                onClick={() => onSelectIncident(inc.id)}
                className={`group bg-slate-900 hover:bg-slate-850 border rounded-xl p-4 cursor-pointer transition-all hover:shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  isUnassigned && isAdmin
                    ? 'border-amber-900/60 hover:border-amber-700/80 bg-slate-900/90'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Left block: Identifiers & Title */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="font-mono text-xs font-bold text-sky-400 bg-sky-950/80 border border-sky-800/80 px-2 py-0.5 rounded">
                      {inc.code}
                    </span>
                    {getStatusBadge(inc.status)}
                    {getPriorityBadge(inc.priority)}
                    <span className="text-[11px] text-slate-400 flex items-center gap-1 bg-slate-800 px-2 py-0.5 rounded">
                      {getCategoryIcon(inc.category)}
                      <span className="capitalize">{inc.category}</span>
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-slate-100 group-hover:text-white transition-colors truncate">
                    {inc.title}
                  </h3>

                  <p className="text-xs text-slate-400 line-clamp-1 mt-1">
                    {inc.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 mt-2 text-[11px] text-slate-400">
                    <span className="text-slate-300">
                      Abierta por: <strong className="text-white">@{inc.creator_username}</strong> {inc.creator_department ? `(${inc.creator_department})` : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      {formatDate(inc.created_at)}
                    </span>
                  </div>
                </div>

                {/* Right block: Assignment status, metrics & action */}
                <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800/80">
                  {/* Message & Attachment counters */}
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1" title="Mensajes en el hilo">
                      <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                      <span>{inc.message_count || 1}</span>
                    </span>
                    {(inc.attachment_count ?? 0) > 0 && (
                      <span className="flex items-center gap-1 text-emerald-400" title="Imágenes adjuntas">
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>{inc.attachment_count}</span>
                      </span>
                    )}
                  </div>

                  {/* Assignment Pill / Action */}
                  <div className="flex items-center gap-2">
                    {inc.assigned_admin_username ? (
                      <div className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-800/80 border border-slate-700/80 px-2.5 py-1 rounded-lg">
                        <UserCheck className="w-3.5 h-3.5 text-sky-400" />
                        <span>@{inc.assigned_admin_username}</span>
                        {isAssignedToMe && (
                          <span className="text-[10px] text-sky-400 font-semibold">(Tú)</span>
                        )}
                      </div>
                    ) : (
                      isAdmin ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onQuickAssign(inc.id);
                          }}
                          className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-2.5 py-1 rounded-lg shadow-xs flex items-center gap-1 transition-colors active:scale-95"
                          title="Asignarme a mí esta incidencia ahora"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Asignarme</span>
                        </button>
                      ) : (
                        <span className="text-xs text-amber-400/90 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded">
                          Pendiente de asignación
                        </span>
                      )
                    )}

                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 transition-colors" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
