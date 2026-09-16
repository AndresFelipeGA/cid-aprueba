import { useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { MetaProvider } from './context/MetaContext.jsx';
import { ConfirmProvider } from './context/ConfirmContext.jsx';
import { DocumentModalProvider } from './context/DocumentModalContext.jsx';
import { BadgeProvider } from './context/BadgeContext.jsx';
import { PageTitleProvider } from './context/PageTitleContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import Header from './components/Header.jsx';
import LoginPage from './components/LoginPage.jsx';
import EmailModal from './components/EmailModal.jsx';
import Splash from './components/Splash.jsx';
import Loading from './components/Loading.jsx';

import Dashboard from './views/Dashboard.jsx';
import Requisitions from './views/Requisitions.jsx';
import RequisitionDetail from './views/RequisitionDetail.jsx';
import Acta from './views/Acta.jsx';
import CreateRequisition from './views/CreateRequisition.jsx';
import Profile from './views/Profile.jsx';
import Users from './views/Users.jsx';

function AppShell() {
  const { logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Explicit logout drops the deep link so the next login lands on the dashboard
  // (session expiry, elsewhere, leaves the hash alone so re-login returns to the same page).
  const handleLogout = () => {
    logout();
    window.location.hash = '/dashboard';
  };

  return (
    <div id="app-view" className="app">
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <Header onLogout={handleLogout} onToggleMobile={() => setMobileOpen((o) => !o)} />
      <main className="main" id="main-content" role="main">
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/requisitions" element={<Requisitions />} />
          <Route path="/requisitions/:id" element={<RequisitionDetail />} />
          <Route path="/requisitions/:id/acta" element={<Acta />} />
          <Route path="/create" element={<CreateRequisition />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/users" element={<Users />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
      <EmailModal />
    </div>
  );
}

function Root() {
  const { status } = useAuth();
  const [splash, setSplash] = useState(null); // { firstName } | null

  if (status === 'loading') return <Loading />;

  return (
    <>
      {status === 'authed' ? (
        <PageTitleProvider>
          <BadgeProvider>
            <AppShell />
          </BadgeProvider>
        </PageTitleProvider>
      ) : (
        <LoginPage onLoginSuccess={(user) => setSplash({ firstName: user.full_name ? user.full_name.split(' ')[0] : '' })} />
      )}
      {splash && <Splash firstName={splash.firstName} onDone={() => setSplash(null)} />}
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <MetaProvider>
        <ConfirmProvider>
          <DocumentModalProvider>
            <AuthProvider>
              <HashRouter>
                <Root />
              </HashRouter>
            </AuthProvider>
          </DocumentModalProvider>
        </ConfirmProvider>
      </MetaProvider>
    </ToastProvider>
  );
}
