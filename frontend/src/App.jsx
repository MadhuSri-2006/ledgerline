import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import AccountHolderDashboard from './pages/AccountHolderDashboard';
import AdminDashboard from './pages/AdminDashboard';
import AuditorDashboard from './pages/AuditorDashboard';
import { LoadingCenter } from './components/ui';

/**
 * Route protection wrapper based on authentication and RBAC roles.
 */
function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingCenter />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to the appropriate home for this user's role
    if (user.role === 'ADMIN') return <Navigate to="/admin" replace />;
    if (user.role === 'AUDITOR') return <Navigate to="/auditor" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

/**
 * Root index redirector based on authenticated role.
 */
function RootRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingCenter />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'ADMIN') return <Navigate to="/admin" replace />;
  if (user.role === 'AUDITOR') return <Navigate to="/auditor" replace />;
  return <Navigate to="/dashboard" replace />;
}

/**
 * Public route: redirects already logged-in users to home
 */
function PublicRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingCenter />
      </div>
    );
  }

  if (user) {
    return <RootRedirect />;
  }

  return children;
}

/**
 * Main Layout wrapper with Navbar and persistent Footer
 */
function AppLayout({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <main style={{ flex: 1, paddingBottom: '40px' }}>
        {children}
      </main>
      <footer style={{
        borderTop: '1px solid var(--gray-200)',
        backgroundColor: '#ffffff',
        padding: '20px',
        textAlign: 'center',
        fontSize: '13px',
        color: 'var(--gray-500)',
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <strong>LedgerLine</strong> — Secure, Auditable Money-Movement Ledger | Snovasys Fresher Hiring Challenge 2026
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Login Route */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />

          {/* Root Redirect */}
          <Route path="/" element={<RootRedirect />} />

          {/* Account Holder Dashboard */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={['ACCOUNT_HOLDER']}>
                <AppLayout>
                  <AccountHolderDashboard />
                </AppLayout>
              </ProtectedRoute>
            }
          />

          {/* Admin Dashboard */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AppLayout>
                  <AdminDashboard />
                </AppLayout>
              </ProtectedRoute>
            }
          />

          {/* Auditor Dashboard */}
          <Route
            path="/auditor"
            element={
              <ProtectedRoute allowedRoles={['AUDITOR']}>
                <AppLayout>
                  <AuditorDashboard />
                </AppLayout>
              </ProtectedRoute>
            }
          />

          {/* 404 Fallback */}
          <Route
            path="*"
            element={
              <AppLayout>
                <div style={{ maxWidth: '600px', margin: '80px auto', textAlign: 'center', padding: '0 20px' }}>
                  <h1 style={{ fontSize: '48px', fontWeight: '800', color: 'var(--gray-300)' }}>404</h1>
                  <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--gray-800)', marginTop: '12px' }}>
                    Page Not Found
                  </h2>
                  <p style={{ color: 'var(--gray-500)', marginTop: '8px' }}>
                    The page you requested does not exist or you do not have permission to access it.
                  </p>
                  <div style={{ marginTop: '24px' }}>
                    <a href="/" className="btn btn-primary">
                      Return to Dashboard
                    </a>
                  </div>
                </div>
              </AppLayout>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
