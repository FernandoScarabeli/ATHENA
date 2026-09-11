import { Icon } from './Icon';
export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`} aria-label="ATHENA"><span className="brand-mark"><Icon name="branch" size={17}/></span><span>ATHE<span className="brand-muted">NA</span></span></div>;
}
