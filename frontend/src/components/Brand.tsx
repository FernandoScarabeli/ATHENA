export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`} aria-label="ATHENA">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" role="presentation">
          <path d="M5.75 18.25 10.9 6.9a1.2 1.2 0 0 1 2.2 0l5.15 11.35" />
          <path d="M8.1 13.5h7.8" />
          <circle cx="12" cy="6" r="1.55" />
          <circle cx="5.4" cy="19" r="1.55" />
          <circle cx="18.6" cy="19" r="1.55" />
        </svg>
      </span>
      <span className="brand-wordmark">ATHENA</span>
    </div>
  );
}
