import { useState, useRef, useEffect } from 'react';
import { AudioLines, Eye, EyeOff, Headphones, Loader2, Users } from 'lucide-react';
import { Link } from 'wouter';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { sessionStore } from '@/lib/storage';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState(() => sessionStore.getItem('egv.authEmail') || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const online = useOnline();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current || !online) return;
    inFlight.current = true;
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      sessionStore.removeItem('egv.authEmail');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось войти');
      if (err instanceof ApiError && err.status === 401) { setPassword(''); requestAnimationFrame(() => passwordRef.current?.focus()); }
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
        <h1 className="font-display text-[26px] font-semibold tracking-tight">С возвращением</h1>
        <p className="text-sm text-muted-foreground">{import.meta.env.VITE_BROWSER_CLIENT === 'true' ? 'Браузерная версия · установка не нужна' : 'Войди, чтобы созваниваться с друзьями'}</p>
        {import.meta.env.VITE_BROWSER_CLIENT === 'true' && <p className="text-xs text-muted-foreground pt-2">Твой обычный аккаунт EG Voice. После обновления вкладки потребуется войти снова.</p>}
      </div>
      {!online && <div role="status" className="lab-auth-error">Нет подключения к интернету. Данные формы сохранены; повтори вход, когда сеть вернётся.</div>}
      <div className="lab-auth-methods"><span>Email</span><button type="button" disabled>Телефон</button></div>
      <p className="text-xs text-muted-foreground mb-4">Вход по телефону пока недоступен.</p>
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
            disabled={busy}
            autoComplete="email"
            autoFocus
          />
        </Field>
        <Field label="Пароль">
          <PasswordInput
            inputRef={passwordRef}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-secondary rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            placeholder="••••••••"
            data-testid="input-password"
            required
            disabled={busy}
            autoComplete="current-password"
          />
        </Field>

        {error && (
          <div role="alert" className="lab-auth-error">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !online}
          className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-semibold hover-elevate mt-2 disabled:opacity-60"
          data-testid="button-login"
        >
          {busy ? <><Loader2 size={16} className="inline animate-spin mr-2" />Входим…</> : 'Войти'}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-muted-foreground">
        Нет аккаунта?{' '}
        <Link href="/register" className="text-primary hover:underline" data-testid="link-register">
          Создать
        </Link>
      </div>
      <Link href="/join" className="block mt-4 text-center text-sm text-primary">Есть приглашение? Вставить ссылку или код</Link>
    </AuthShell>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="lab-auth">
      <main className="lab-auth-left"><div className="lab-auth-card">{children}</div></main>
      <aside className="lab-auth-right" aria-label="Об EG Voice">
        <div className="lab-wave-art" aria-hidden="true">{Array.from({ length: 35 }, (_, i) => <i key={i} style={{ height: `${32 + Math.sin(i * .48) ** 2 * 180}px`, animationDelay: `${i * -.07}s` }} />)}</div>
        <div className="lab-auth-big">Свои люди.<br />Один <span>голосовой канал.</span></div>
        <div className="lab-auth-features"><span><Headphones size={16} />Голос и чат</span><span><Users size={16} />Твоя тусовка</span><span><AudioLines size={16} />Без лишних кнопок</span></div>
      </aside>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-muted-foreground mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return online;
}

export function PasswordInput({ inputRef, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { inputRef?: React.Ref<HTMLInputElement> }) {
  const [visible, setVisible] = useState(false), [caps, setCaps] = useState(false);
  return <span className="block">
    <span className="relative block"><input {...props} ref={inputRef} type={visible ? 'text' : 'password'} style={{ paddingRight: 44 }}
      onKeyUp={e => setCaps(e.getModifierState('CapsLock'))} onKeyDown={e => { setCaps(e.getModifierState('CapsLock')); props.onKeyDown?.(e); }} onBlur={() => setCaps(false)} />
      <button type="button" disabled={props.disabled} className="absolute right-0 top-0 h-full w-11 flex items-center justify-center text-muted-foreground"
        aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
    </span>
    {caps && <span role="status" className="block text-xs text-amber-400 mt-2">Включён Caps Lock</span>}
  </span>;
}
