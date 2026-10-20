import { Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { Sidebar, MobileNavigation } from './Navigation.jsx';
import EmptyState from '../common/EmptyState.jsx';
import { usePosts } from '../../hooks/usePosts.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function AppLayout() {
  const { status, loadError } = usePosts();
  const { error: authError, clearError } = useAuth();
  const notice = useLocation().state?.notice;

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <Sidebar />
      <main id="main" className="page">
        {notice && <p className="notice" role="status">{notice}</p>}
        {authError && (
          <p className="notice notice--error" role="alert">
            {authError}{' '}
            <button type="button" className="auth-error__dismiss" onClick={clearError}>Dismiss</button>
          </p>
        )}
        {status === 'error'
          ? <EmptyState icon={WifiOff} title="Couldn’t load the gallery">{loadError || 'Something went wrong reading the data. Refresh the page to try again.'}</EmptyState>
          : <Outlet />}
      </main>
      <MobileNavigation />
      <ScrollRestoration />
    </div>
  );
}
