import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Users } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import { sessionStore } from '@/lib/storage';

type InvitePreview = {
  server: { id: string; name: string };
  inviter: string;
};

export default function Invite({ code }: { code: string }) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { user, loading } = useAuth();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setPreview(null); setError(null);
    api.get<InvitePreview>(`/api/invites/${encodeURIComponent(code)}`)
      .then(result => { if (active) setPreview(result); })
      .catch((err) => { if (active) setError(err instanceof ApiError ? err.message : 'Не удалось загрузить'); });
    return () => { active = false; };
  }, [code, attempt]);

  const accept = async () => {
    if (busy) return;
    if (!user) {
      // Сохраняем код в sessionStorage и уходим на логин; после — вернуть сюда.
      sessionStore.setItem('egv.pendingInvite', code);
      setLocation('/login');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ serverId: string }>(`/api/invites/${encodeURIComponent(code)}/accept`);
      sessionStore.setItem('egv.openServer', result.serverId);
      sessionStore.removeItem('egv.pendingInvite');
      await qc.invalidateQueries({ queryKey: ['/api/servers'] });
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
            <button className="text-sm text-primary hover:underline mb-4 block mx-auto" onClick={() => setAttempt(a => a + 1)}>Повторить загрузку</button>
            <Link href="/join" className="text-sm text-primary hover:underline">Ввести другое приглашение</Link>
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
              <span>Добавим сервер в твой список. Микрофон сам не включится.</span>
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
