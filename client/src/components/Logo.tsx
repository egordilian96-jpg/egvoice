// Логотип EG Voice — минимальный geometric wordmark в духе LiveKit.
// Символ: круг + вертикальная штриха (waveform-первое-биение).

type Props = {
  className?: string;
  showWordmark?: boolean;
};

export function Logo({ className = '', showWordmark = true }: Props) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`} aria-label="EG Voice">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 6.5v11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M8 9.5v5M16 9.5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      </svg>
      {showWordmark && (
        <span className="font-display font-semibold text-[15px] tracking-tight">EG Voice</span>
      )}
    </div>
  );
}
