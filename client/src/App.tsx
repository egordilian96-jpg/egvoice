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

function LoadingScreen() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
      Загружаю…
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Redirect to="/login" />;
  return <>{children}</>;
}

function AuthOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Redirect to="/" />;
  return <>{children}</>;
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
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <AppRouter />
          </Router>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
