import { useEffect, useState } from 'react';
import { Copy, Check, UserPlus, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { api, ApiError } from '@/lib/api';

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
  const { toast } = useToast();

  const inviteLink = code ? `${window.location.origin}/#/invite/${code}` : '';

  useEffect(() => {
    if (!open || !serverId) return;
    setCode(null);
    setError(null);
    setLoading(true);
    api.post<{ code: string; expiresAt: string }>(`/api/servers/${serverId}/invites`, {})
      .then((r) => setCode(r.code))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Не удалось создать ссылку'))
      .finally(() => setLoading(false));
  }, [open, serverId]);

  const copy = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast({ title: 'Ссылка скопирована' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Не получилось скопировать', variant: 'destructive' });
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
            Ссылка действует 24 часа. Кинь другу — он попадёт прямо на сервер.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Генерирую ссылку…
            </div>
          ) : error ? (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
              {error}
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2.5">
              <code className="flex-1 text-sm font-mono truncate text-foreground" data-testid="text-invite-link">{inviteLink}</code>
              <button
                onClick={copy}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-semibold hover-elevate"
                data-testid="button-copy-invite"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Скопировано' : 'Скопировать'}
              </button>
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            Ссылка одноразово-многоразовая: работает 24 часа для всех, у кого есть код.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
