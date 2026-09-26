import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { UserPlus } from 'lucide-react';
import { parseInvite } from '@/lib/invites';

export default function Join() {
  const [, navigate] = useLocation();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  return <main className="min-h-screen flex items-center justify-center bg-background p-4">
    <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8">
      <UserPlus className="text-primary w-7 h-7 mb-4" />
      <h1 className="font-display text-2xl font-semibold">Войти по приглашению</h1>
      <p className="text-sm text-muted-foreground mt-3 mb-6">Попроси друга открыть «Пригласить друга» и прислать ссылку или код. Создавать ещё один сервер не нужно.</p>
      <form className="space-y-4" onSubmit={e => {
        e.preventDefault();
        const code = parseInvite(value);
        if (!code) { setError('Вставь ссылку EG Voice или код из 8 символов. Регистр букв важен.'); return; }
        navigate(`/invite/${code}`);
      }}>
        <label className="block text-sm font-medium">Ссылка или код приглашения
          <input autoFocus value={value} onChange={e => { setValue(e.target.value); setError(''); }}
            maxLength={2048} autoComplete="off" autoCapitalize="none" spellCheck={false}
            aria-invalid={!!error} aria-describedby="join-help"
            data-testid="input-invite" placeholder="Например: Ab3d_Ef9"
            className="mt-2 block w-full rounded-lg bg-secondary px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary" />
        </label>
        <p id="join-help" role={error ? 'alert' : undefined} className={`text-xs ${error ? 'text-destructive' : 'text-muted-foreground'}`}>
          {error || 'Вставь через Ctrl+V. Сначала покажем название сервера, затем ты подтвердишь вход.'}
        </p>
        <button disabled={!value.trim()} className="w-full rounded-lg bg-primary px-3 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40" data-testid="button-preview-invite">Проверить приглашение</button>
      </form>
      <Link href="/" className="mt-5 block text-center text-sm text-muted-foreground hover:text-foreground">Назад</Link>
    </section>
  </main>;
}
