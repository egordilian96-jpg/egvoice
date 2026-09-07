import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Users } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type InvitePreview = {
  server: { id: string; name: string };
  inviter: string;
};

export default function Invite({ code }: { code: string }) {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<InvitePreview>(`/api/invites/${code}`)
      .then(setPreview)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Не удалось загрузить'));
  }, [code]);

  const accept = async () => {
    if (!user) {
      // Сохраняем код в sessionStorage и уходим на логин; после — вернуть сюда.
      sessionStorage.setItem('egv.pendingInvite', code);
      setLocation('/login');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post<{ serverId: string }>(`/api/invites/${code}/accept`);
      setLocation('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось принять');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-card border border-card-border rounded-2xl p-8 text-center">
        <div className="flex justify-center text-primary mb-6">
          <Logo />
        </div>

        {error && !preview ? (
          <>
            <div className="text-destructive font-semibold mb-3">{error}</div>
            <Link href="/">
              <button className="text-sm text-primary hover:underline">На главную</button>
            </Link>
          </>
        ) : preview ? (
          <>
            <div className="w-20 h-20 rounded-2xl bg-primary/15 text-primary flex items-center justify-center text-2xl font-display font-bold mx-auto mb-4 glow-primary">
              {preview.server.name.slice(0, 2).toUpperCase()}
            </div>

            <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-2">Приглашение на сервер</div>
            <h1 className="font-display text-[26px] font-semibold mb-1 tracking-tight" data-testid="text-server-name">{preview.server.name}</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Тебя пригласил <span className="text-foreground font-medium">{preview.inviter}</span>
            </p>

            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-8">
              <Users className="w-4 h-4" />
              <span>сервер EG Voice</span>
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2 mb-3">
                {error}
              </div>
            )}

            <button
              onClick={accept}
              disabled={busy}
              className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-semibold hover-elevate mb-3 disabled:opacity-60"
              data-testid="button-accept-invite"
            >
              {busy ? 'Принимаю…' : user ? 'Принять приглашение' : 'Войти, чтобы принять'}
            </button>

            <Link href="/">
              <button className="w-full text-sm text-muted-foreground hover:text-foreground py-1" data-testid="link-decline">
                Не сейчас
              </button>
            </Link>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">Загружаю приглашение…</div>
        )}
      </div>
    </div>
  );
}
