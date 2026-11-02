import { AuthProvider, useAuth } from './context/AuthContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { AuthScreen } from './components/AuthScreen';
import { AppShell } from './components/AppShell';

function Gate() {
  const { configured, loading, user } = useAuth();

  if (!configured) return <AuthScreen />;
  if (loading) {
    return (
      <div className="auth-shell">
        <div className="auth-panel">
          <div className="brand">
            <span className="mark">w</span>
            writeoff<span style={{ color: '#a4b984' }}>.</span>
          </div>
          <p>Restoring your session…</p>
        </div>
      </div>
    );
  }
  if (!user) return <AuthScreen />;
  return (
    <WorkspaceProvider>
      <AppShell />
    </WorkspaceProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
