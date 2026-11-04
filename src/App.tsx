import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { AuthScreen } from './components/AuthScreen';
import { AppShell } from './components/AppShell';
import { isLocalPreviewActive } from './lib/localWorkspace';

function Gate() {
  const { configured, loading, user } = useAuth();
  const [localPreview, setLocalPreview] = useState(() => isLocalPreviewActive());

  useEffect(() => {
    const onStorage = () => setLocalPreview(isLocalPreviewActive());
    window.addEventListener('storage', onStorage);
    // custom event for same-tab activation
    window.addEventListener('writeoff-local-preview', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('writeoff-local-preview', onStorage);
    };
  }, []);

  if (loading && configured) {
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

  if (user || localPreview) {
    return (
      <WorkspaceProvider>
        <AppShell />
      </WorkspaceProvider>
    );
  }

  return <AuthScreen onLocalPreview={() => setLocalPreview(true)} />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
