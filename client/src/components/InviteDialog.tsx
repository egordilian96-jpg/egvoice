import { useEffect, useState } from 'react';
import { Copy, Check, UserPlus, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { api, ApiError } from '@/lib/api';
import { copyInviteText, inviteLink as makeInviteLink } from '@/lib/invites';

type Props = {
  open: boolean;
  onClose: () => void;
  serverId: string | null;
  serverName: string;
};

export function InviteDialog({ open, onClose, serverId, serverName }: Props) {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { toast } = useToast();

  // Never use window.location.origin: in Tauri it is a local WebView address.
  const inviteLink = code ? makeInviteLink(code, import.meta.env.VITE_PUBLIC_APP_URL || 'https://egvoice.pplx.app') : null;

  useEffect(() => {
    if (!open || !serverId) return;
    let active = true;
    setCopied(false);
    setCode(null);
    setError(null);
    setLoading(true);
    api.post<{ code: string; expiresAt: string }>(`/api/servers/${serverId}/invites`, {})
      .then((r) => { if (active) setCode(r.code); })
      .catch((err) => { if (active) setError(err instanceof ApiError ? err.message : 'Не удалось создать ссылку. Проверь подключение и повтори.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, serverId, attempt]);

  const copy = async (text: string) => {
    if (await copyInviteText(text)) {
      setCopied(true);
      toast({ title: 'Приглашение скопировано' });
    } else {
      toast({ title: 'Буфер обмена недоступен', description: 'Выдели ссылку или код в поле и нажми Ctrl+C.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            Пригласить в «{serverName}»
          </DialogTitle>
          <DialogDescription>
            Друг уже зарегистрирован? Пусть в приложении нажмёт «Войти по приглашению» и вставит ссылку или код.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Генерирую ссылку…
            </div>
          ) : error ? (
            <div role="alert" className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
              {error}
              <button className="block underline mt-2" onClick={() => setAttempt(a => a + 1)}>Повторить</button>
            </div>
          ) : code ? (
            <div className="space-y-4">
              {inviteLink && <label className="block text-xs text-muted-foreground">Ссылка приглашения
                <input readOnly value={inviteLink} onFocus={e => e.target.select()} aria-label="Ссылка приглашения"
                  className="block mt-2 w-full bg-secondary rounded-lg px-3 py-3 text-sm text-foreground" data-testid="text-invite-link" />
              </label>}
              <button
                onClick={() => void copy(inviteLink || code)}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-semibold hover-elevate"
                data-testid="button-copy-invite"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Скопировано' : 'Скопировать'}
              </button>
              <label className="block text-xs text-muted-foreground">Или отправь короткий код
                <input readOnly value={code} onFocus={e => e.target.select()} aria-label="Код приглашения" data-testid="text-invite-code"
                  className="block mt-2 w-full bg-secondary rounded-lg px-3 py-3 font-mono text-xl tracking-widest text-foreground" />
              </label>
              <button className="text-sm text-primary hover:underline" onClick={() => void copy(code)} data-testid="button-copy-code">Скопировать код</button>
            </div>
          ) : null}
          <div className="text-xs text-muted-foreground">
            Приглашение действует 24 часа. Делись только с друзьями. После входа выберите один и тот же голосовой канал, например «общий».
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
