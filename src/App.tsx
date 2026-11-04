import React, { useState, useEffect, useCallback } from 'react';
import { User, Incident } from './types.ts';
import { apiClient } from './services/apiClient.ts';
import { Header } from './components/Header.tsx';
import { IncidentList } from './components/IncidentList.tsx';
import { IncidentDetail } from './components/IncidentDetail.tsx';
import { NewIncidentModal } from './components/NewIncidentModal.tsx';
import { ServerInfoModal } from './components/ServerInfoModal.tsx';
import { LoginView } from './components/LoginView.tsx';
import { UserManagementModal } from './components/UserManagementModal.tsx';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('incidencias_user');
      return stored ? JSON.parse(stored) : null;
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
  const handleLoginSuccess = (user: User) => {
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
    if (!currentUser || currentUser.role !== 'admin') return;
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

      {currentUser && currentUser.role === 'admin' && (
        <UserManagementModal
          isOpen={isUserManagementOpen}
          onClose={() => {
            setIsUserManagementOpen(false);
            fetchIncidents(true);
          }}
          currentAdmin={currentUser}
        />
      )}
    </div>
  );
}
