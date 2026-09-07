import { useState } from 'react';
import { Link } from 'wouter';
import { Logo } from '@/components/Logo';
import { AuthShell, Field } from './Login';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';

export default function Register() {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register(email.trim(), password, nickname.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось создать аккаунт');
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
        <h1 className="font-display text-[26px] font-semibold tracking-tight">Создать аккаунт</h1>
        <p className="text-sm text-muted-foreground">30 секунд — и ты в игре</p>
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
        <Field label="Ник">
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="w-full bg-secondary rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            placeholder="твой ник в игре"
            data-testid="input-nickname"
            required
            minLength={2}
            maxLength={30}
          />
        </Field>
        <Field label="Пароль">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-secondary rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            placeholder="минимум 8 символов"
            minLength={8}
            data-testid="input-password"
            required
            autoComplete="new-password"
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
          data-testid="button-register"
        >
          {busy ? 'Создаю…' : 'Создать аккаунт'}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-muted-foreground">
        Уже с нами?{' '}
        <Link href="/login" className="text-primary hover:underline" data-testid="link-login">
          Войти
        </Link>
      </div>
    </AuthShell>
  );
}
