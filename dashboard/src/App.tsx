import { useState, useEffect, useCallback, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { lazyWithRetry as lazy } from './utils/lazyWithRetry';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { RoleProvider, useRole, type UserRole } from './hooks/useRole';
import { ErrorBoundary } from './components/ErrorBoundary';
import { authApi, getAccessToken, setAccessToken, clearAccessToken } from './services/api';
import { AttentionProvider } from './hooks/useAttention';
import './App.css';
import './design.css';

const Landing = lazy(() => import('./pages/Landing').then(m => ({ default: m.Landing })));
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Signup = lazy(() => import('./pages/Signup').then(m => ({ default: m.Signup })));
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Sessions = lazy(() => import('./pages/Sessions').then(m => ({ default: m.Sessions })));
const Chats = lazy(() => import('./pages/Chats').then(m => ({ default: m.Chats })));
const KnowledgeBase = lazy(() => import('./pages/KnowledgeBase').then(m => ({ default: m.KnowledgeBase })));
const Audiences = lazy(() => import('./pages/Audiences').then(m => ({ default: m.Audiences })));
const Campaigns = lazy(() => import('./pages/Campaigns').then(m => ({ default: m.Campaigns })));
const CampaignDetail = lazy(() => import('./pages/CampaignDetail').then(m => ({ default: m.CampaignDetail })));
const Webhooks = lazy(() => import('./pages/Webhooks').then(m => ({ default: m.Webhooks })));
const Templates = lazy(() => import('./pages/Templates').then(m => ({ default: m.Templates })));
const Logs = lazy(() => import('./pages/Logs').then(m => ({ default: m.Logs })));
const ApiKeys = lazy(() => import('./pages/ApiKeys').then(m => ({ default: m.ApiKeys })));
const MessageTester = lazy(() => import('./pages/MessageTester').then(m => ({ default: m.MessageTester })));

// The product (dashboard + auth) is mounted under this path so the marketing
// landing page can own the site root ("/"). react-router's basename keeps every
// in-app link/navigation working unchanged — they all resolve under /app.
const APP_BASENAME = '/app';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

// Business-membership roles → the dashboard's coarse UserRole (owner/admin manage everything).
function mapMembershipRole(role?: string): UserRole {
  if (role === 'owner' || role === 'admin') return 'admin';
  if (role === 'member') return 'operator';
  return 'viewer';
}

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!getAccessToken());
  const [authView, setAuthView] = useState<'login' | 'signup'>('login');
  const { setRole, role } = useRole();

  const loadMe = useCallback(async () => {
    try {
      const me = await authApi.me();
      const active = me.businesses.find(b => b.id === me.activeBusinessId) || me.businesses[0];
      setRole(mapMembershipRole(active?.role));
    } catch {
      setRole('viewer');
    }
  }, [setRole]);

  const handleAuthed = async (token: string) => {
    setAccessToken(token);
    await loadMe();
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      /* best-effort */
    }
    clearAccessToken();
    setRole(null);
    setIsAuthenticated(false);
    setAuthView('login');
  };

  // Refresh role/identity on mount if a token is already present.
  useEffect(() => {
    if (getAccessToken()) void loadMe();
  }, [loadMe]);

  const loadingFallback = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <Loader2 className="animate-spin" size={32} />
    </div>
  );

  // Anything outside /app is the public marketing site. Crossing into the product is a
  // full-page navigation (window.location), so reading the pathname once here is enough.
  const path = window.location.pathname;
  const inApp = path === APP_BASENAME || path.startsWith(`${APP_BASENAME}/`);

  if (!inApp) {
    return (
      <Suspense fallback={loadingFallback}>
        <Landing />
      </Suspense>
    );
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={loadingFallback}>
        {authView === 'login' ? (
          <Login onAuthed={handleAuthed} onSwitchToSignup={() => setAuthView('signup')} />
        ) : (
          <Signup onAuthed={handleAuthed} onSwitchToLogin={() => setAuthView('login')} />
        )}
      </Suspense>
    );
  }

  return (
    <ToastProvider>
      <BrowserRouter basename={APP_BASENAME}>
        <AuthedShell onLogout={handleLogout} role={role} loadingFallback={loadingFallback} />
      </BrowserRouter>
    </ToastProvider>
  );
}

// Lives inside the router so the AttentionProvider can deep-link into the inbox when a desktop
// notification (fired outside React) is clicked.
function AuthedShell({
  onLogout,
  role,
  loadingFallback,
}: {
  onLogout: () => void;
  role: UserRole | null;
  loadingFallback: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <AttentionProvider
      onOpenChat={(sessionId, chatId) =>
        navigate(`/chats?session=${encodeURIComponent(sessionId)}&chat=${encodeURIComponent(chatId)}`)
      }
    >
      <Suspense fallback={loadingFallback}>
        <Routes>
          <Route path="/" element={<Layout onLogout={onLogout} userRole={role} />}>
            <Route index element={<Dashboard />} />
            <Route path="sessions" element={<Sessions />} />
            <Route path="audiences" element={<Audiences />} />
            <Route path="campaigns" element={<Campaigns />} />
            <Route path="campaigns/:id" element={<CampaignDetail />} />
            <Route path="chats" element={<Chats />} />
            <Route path="knowledge-base" element={<KnowledgeBase />} />
            <Route path="webhooks" element={<Webhooks />} />
            <Route path="templates" element={<Templates />} />
            {role === 'admin' && <Route path="api-keys" element={<ApiKeys />} />}
            <Route path="logs" element={<Logs />} />
            <Route path="message-tester" element={<MessageTester />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </AttentionProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RoleProvider>
          <AppContent />
        </RoleProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
