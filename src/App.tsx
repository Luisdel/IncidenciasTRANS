import React, { useState, useEffect, useCallback } from 'react';
import { User, Incident } from './types.ts';
import { apiClient, setSessionToken } from './services/apiClient.ts';
import { Header } from './components/Header.tsx';
import { IncidentList } from './components/IncidentList.tsx';
import { IncidentDetail } from './components/IncidentDetail.tsx';
import { NewIncidentModal } from './components/NewIncidentModal.tsx';
import { ServerInfoModal } from './components/ServerInfoModal.tsx';
import { LoginView } from './components/LoginView.tsx';
import { UserManagementModal } from './components/UserManagementModal.tsx';
import { ClientSessionsModal } from './components/ClientSessionsModal.tsx';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('incidencias_user');
      const token = localStorage.getItem('incidencias_token');
      if (!stored || !token) {
        // Sessions are now backed by a server token. Force a fresh login
        // for browsers that still have the old localStorage format.
        if (stored && !token) localStorage.removeItem('incidencias_user');
        return null;
      }
      return JSON.parse(stored);
    } catch {
      return null;
    }
  });

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedIncidentId, setSelectedIncidentId] = useState<number | null>(null);

  // Modals
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [isClientSessionsOpen, setIsClientSessionsOpen] = useState(false);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';

  // Fetch incidents list (with strict user isolation on SQLite server)
  const fetchIncidents = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setIsRefreshing(true);

    try {
      const params = currentUser ? {
        requester_role: currentUser.role,
        requester_username: currentUser.username,
      } : undefined;
      const data = await apiClient.getIncidents(params);
      setIncidents(data);
    } catch (err) {
      console.error('Error al cargar incidencias de IncidenciasTRANS:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchIncidents();
    // Silent periodic refresh for LAN synchronization
    const interval = setInterval(() => {
      fetchIncidents(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchIncidents]);

  // Handle user login success
  const handleLoginSuccess = (user: User, token: string) => {
    setSessionToken(token);
    setCurrentUser(user);
    try {
      localStorage.setItem('incidencias_user', JSON.stringify(user));
    } catch {
      // ignore
    }
    setIsLoginModalOpen(false);
  };

  // Switch or logout user
  const handleSwitchUser = () => {
    setIsLoginModalOpen(true);
  };

  // Quick self-assign from list (Admin only)
  const handleQuickAssign = async (incidentId: number) => {
    if (!currentUser || !isAdmin) return;
    try {
      await apiClient.assignIncident(incidentId, currentUser.username);
      await fetchIncidents(true);
    } catch (err: any) {
      alert('Error al asignar incidencia: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-sky-500 selection:text-white">
      {/* Top Header */}
      <Header
        currentUser={currentUser}
        onOpenNewIncident={() => {
          if (!currentUser) setIsLoginModalOpen(true);
          else setIsNewModalOpen(true);
        }}
        onOpenServerModal={() => setIsServerModalOpen(true)}
        onOpenUserManagement={() => setIsUserManagementOpen(true)}
        onOpenClientSessions={() => setIsClientSessionsOpen(true)}
        onSwitchUser={handleSwitchUser}
        onSelectIncident={(id) => setSelectedIncidentId(id)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {/* If user clicks Switch User or has not selected a profile yet */}
        {(!currentUser || isLoginModalOpen) ? (
          <LoginView
            onSuccess={handleLoginSuccess}
            onCancel={currentUser ? () => setIsLoginModalOpen(false) : undefined}
          />
        ) : selectedIncidentId ? (
          /* Incident Thread View */
          <IncidentDetail
            incidentId={selectedIncidentId}
            currentUser={currentUser}
            onBack={() => {
              setSelectedIncidentId(null);
              fetchIncidents(true);
            }}
            onIncidentUpdated={() => fetchIncidents(true)}
          />
        ) : (
          /* Incident List View */
          <IncidentList
            incidents={incidents}
            currentUser={currentUser}
            onSelectIncident={(id) => setSelectedIncidentId(id)}
            onOpenNewIncident={() => setIsNewModalOpen(true)}
            onQuickAssign={handleQuickAssign}
            onRefresh={() => fetchIncidents(true)}
            isRefreshing={isRefreshing}
          />
        )}
      </main>

      {/* Modals */}
      <NewIncidentModal
        isOpen={isNewModalOpen}
        currentUser={currentUser}
        onClose={() => setIsNewModalOpen(false)}
        onCreated={(id) => {
          fetchIncidents(true);
          setSelectedIncidentId(id);
        }}
      />

      <ServerInfoModal
        isOpen={isServerModalOpen}
        onClose={() => setIsServerModalOpen(false)}
      />

      {currentUser && isAdmin && (
        <>
          <UserManagementModal
            isOpen={isUserManagementOpen}
            onClose={() => {
              setIsUserManagementOpen(false);
              fetchIncidents(true);
            }}
            onDataWiped={() => fetchIncidents(true)}
            currentAdmin={currentUser}
          />
          <ClientSessionsModal
            isOpen={isClientSessionsOpen}
            onClose={() => setIsClientSessionsOpen(false)}
            currentAdmin={currentUser}
          />
        </>
      )}
    </div>
  );
}
