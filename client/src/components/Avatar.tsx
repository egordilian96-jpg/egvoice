import { MicOff } from 'lucide-react';
import { initialsOf } from '@/lib/format';

type MinimalUser = {
  id: string;
  nickname: string;
  avatarColor: string;
};

type Props = {
  user: MinimalUser;
  size?: number;
  showStatus?: boolean;
  online?: boolean;
  speaking?: boolean;
  /** 0..1 — амплитуда голоса, влияет на силу glow (если speaking). */
  level?: number;
  /** Показать «микрофон выкл» бейдж поверх аватара. */
  muted?: boolean;
};

export function UserAvatar({
  user, size = 32, showStatus = false, online = false, speaking = false, level = 0, muted = false,
}: Props) {
  const initials = initialsOf(user.nickname);

  // Тональный glow пропорционален громкости — от 0 до ~24px радиуса.
  const glowRadius = speaking ? Math.round(6 + Math.min(1, level * 1.8) * 22) : 0;
  const glowSpread = speaking ? Math.round(1 + Math.min(1, level * 1.5) * 3) : 0;
  const glowOpacity = speaking ? 0.45 + Math.min(1, level * 1.5) * 0.4 : 0;

  const ringInset = speaking ? Math.max(2, Math.round(size * 0.08)) : 0;

  return (
    <div className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {/* Живой glow — пульсирует пропорционально громкости */}
      {speaking && (
        <div
          className="absolute inset-0 rounded-full pointer-events-none transition-[box-shadow] duration-150"
          style={{
            boxShadow: `0 0 ${glowRadius}px ${glowSpread}px hsl(189 95% 55% / ${glowOpacity})`,
          }}
        />
      )}

      <div
        className="rounded-full flex items-center justify-center text-white font-medium relative"
        style={{
          background: user.avatarColor || '#1FD5F9',
          width: size,
          height: size,
          fontSize: Math.max(11, size * 0.4),
          letterSpacing: '-0.02em',
          outline: speaking ? `${ringInset}px solid hsl(189 95% 55% / 0.9)` : 'none',
          outlineOffset: speaking ? '2px' : '0px',
          transition: 'outline-color 120ms ease, outline-width 120ms ease',
        }}
        data-testid={`img-avatar-${user.id}`}
      >
        {initials}
      </div>

      {/* Онлайн-статус — маленькая точка справа-снизу */}
      {showStatus && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-sidebar ${online ? 'bg-green-500' : 'bg-muted-foreground'}`}
          style={{ width: Math.max(8, size * 0.28), height: Math.max(8, size * 0.28) }}
          data-testid={`status-${user.id}`}
        />
      )}

      {/* Микрофон выключен — красный бейдж */}
      {muted && (
        <span
          className="absolute -bottom-1 -right-1 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center border-2 border-card"
          style={{ width: Math.max(16, size * 0.34), height: Math.max(16, size * 0.34) }}
          data-testid={`mic-off-${user.id}`}
        >
          <MicOff style={{ width: '55%', height: '55%' }} />
        </span>
      )}
    </div>
  );
}
