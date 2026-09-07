import { useState } from 'react';
import { Link } from 'wouter';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <div className="text-center space-y-1 mb-8">
        <div className="flex justify-center text-primary mb-5">
          <Logo />
        </div>
        <h1 className="font-display text-[26px] font-semibold tracking-tight">С возвращением</h1>
        <p className="text-sm text-muted-foreground">Войди, чтобы созваниваться с друзьями</p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-secondary rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            placeholder="you@example.com"
            data-testid="input-email"
            required
            autoComplete="email"
          />
        </Field>
        <Field label="Пароль">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-secondary rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            placeholder="••••••••"
            data-testid="input-password"
            required
            autoComplete="current-password"
          />
        </Field>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-semibold hover-elevate mt-2 disabled:opacity-60"
          data-testid="button-login"
        >
          {busy ? 'Вхожу…' : 'Войти'}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-muted-foreground">
        Нет аккаунта?{' '}
        <Link href="/register" className="text-primary hover:underline" data-testid="link-register">
          Создать
        </Link>
      </div>
    </AuthShell>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm bg-card border border-card-border rounded-2xl p-8">
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{label}</span>
      {children}
    </label>
  );
}
