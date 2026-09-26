import { useEffect } from 'react';
import { Switch, Route, Router, useLocation, Redirect } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider, useAuth } from '@/lib/auth';
import NotFound from '@/pages/not-found';
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Settings from '@/pages/Settings';
import Invite from '@/pages/Invite';
import Join from '@/pages/Join';
import Friends from '@/pages/Friends';
import { VoiceProvider } from '@/lib/voice';

function LoadingScreen() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
      Загружаю…
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading, loadError, retry } = useAuth();
  if (loading) return <LoadingScreen />;
  if (loadError) return <ConnectionRetry retry={retry} />;
  if (!user) return <Redirect to="/login" />;
  return <>{children}</>;
}

function AuthOnly({ children }: { children: React.ReactNode }) {
  const { user, loading, loadError, retry } = useAuth();
  if (loading) return <LoadingScreen />;
  if (loadError) return <ConnectionRetry retry={retry} />;
  if (user) return <Redirect to="/" />;
  return <>{children}</>;
}

function ConnectionRetry({ retry }: { retry: () => void }) {
  return <main className="h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
    <h1 className="text-xl font-semibold">Не удалось проверить подключение</h1>
    <p className="text-muted-foreground">Сессия сохранена. Проверь интернет или повтори позже.</p>
    <button className="bg-primary text-primary-foreground rounded-lg px-4 py-2" onClick={retry}>Повторить</button>
  </main>;
}
function AppRouter() {
  return (
    <Switch>
      <Route path="/">
        <Protected><Home /></Protected>
      </Route>
      <Route path="/login">
        <AuthOnly><Login /></AuthOnly>
      </Route>
      <Route path="/register">
        <AuthOnly><Register /></AuthOnly>
      </Route>
      <Route path="/settings">
        <Protected><Settings /></Protected>
      </Route>
      <Route path="/invite/:code">
        {(params) => <Invite code={params.code} />}
      </Route>
      <Route path="/join" component={Join} />
      <Route path="/friends"><Protected><Friends /></Protected></Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function VoiceSession() {
  const { user } = useAuth();
  return <VoiceProvider key={user?.id ?? 'guest'}><AppRouter /></VoiceProvider>;
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add('dark');
    // Reports a mounted React tree to the local startup log; no user data.
    if ('__TAURI_INTERNALS__' in window) {
      void import('@tauri-apps/api/core')
        .then(({ invoke }) => invoke('frontend_ready'))
        .catch(() => console.warn('Native startup marker unavailable'));
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <VoiceSession />
          </Router>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
