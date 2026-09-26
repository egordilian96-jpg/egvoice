import { useRef, useState } from 'react';
import { Link } from 'wouter';
import { Logo } from '@/components/Logo';
import { AuthShell, Field, PasswordInput, useOnline } from './Login';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { sessionStore } from '@/lib/storage';

export default function Register() {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const online = useOnline();
  const strength = !password ? 0 : password.length < 8 ? 1 : 2 + Number(/[a-zа-я]/i.test(password) && /\d/.test(password)) + Number(password.length >= 12 && /[^\p{L}\p{N}]/u.test(password));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current || !online) return;
    inFlight.current = true;
    setError(null);
    setBusy(true);
    try {
      await register(email.trim(), password, nickname.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось создать аккаунт');
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };

  return (
    <AuthShell>
      <div className="lab-auth-header">
        <div className="text-primary">
          <Logo />
        </div>
        <h1 className="font-display text-[26px] font-semibold tracking-tight">Создать аккаунт</h1>
        <p className="text-sm text-muted-foreground">Создай аккаунт. Ник увидят друзья.</p>
      </div>

      {!online && <div role="status" className="lab-auth-error">Нет подключения к интернету. Данные формы сохранены.</div>}
      <form onSubmit={submit} className="space-y-3 lab-register-form">
        <Field label="Ник">
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="w-full bg-secondary rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            placeholder="твой ник в игре"
            data-testid="input-nickname"
            required
            disabled={busy}
            autoFocus
            minLength={2}
            maxLength={24}
            pattern="[\p{L}\p{N}_.\-]{2,24}"
            title="От 2 до 24 символов: буквы, цифры, точка, дефис или подчёркивание"
            autoComplete="nickname"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-secondary rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            placeholder="you@example.com"
            data-testid="input-email"
            required
            disabled={busy}
            autoComplete="email"
          />
        </Field>
        <Field label="Пароль">
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-secondary rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            placeholder="минимум 8 символов"
            minLength={8}
            data-testid="input-password"
            required
            disabled={busy}
            autoComplete="new-password"
          />
          <span className="lab-password-meter" aria-hidden="true">{[1, 2, 3, 4].map(i => <i key={i} data-on={i <= strength} data-strength={strength} />)}</span>
          <span className="block text-xs text-muted-foreground mt-2">{password && password.length < 8 ? `Нужно минимум 8 символов, сейчас ${password.length}` : 'Используй длинный уникальный пароль'}</span>
        </Field>

        {error && (
          <div role="alert" className="lab-auth-error">
            {error}
            <Link href="/login" onClick={() => sessionStore.setItem('egv.authEmail', email)} className="block text-primary mt-2">Уже есть аккаунт? Войти с этим email</Link>
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !online}
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
