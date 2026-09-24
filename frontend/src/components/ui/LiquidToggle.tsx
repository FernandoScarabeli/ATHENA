import { useId } from 'react';

export function LiquidToggle({ checked, onCheckedChange, label }: { checked: boolean; onCheckedChange: (checked: boolean) => void; label: string }) {
  const filterId = useId();
  return <label className="liquid-toggle">
    <input type="checkbox" role="menuitemcheckbox" aria-label={label} aria-checked={checked} checked={checked} onChange={(event) => onCheckedChange(event.target.checked)}/>
    <svg aria-hidden="true" viewBox="0 0 52 32" style={{ filter: `url(#${filterId})` }}>
      <circle className="liquid-toggle-start" cx="16" cy="16" r="10"/>
      <circle className="liquid-toggle-end" cx="36" cy="16" r="10"/>
      {checked && <circle className="liquid-toggle-drop" cx="35" cy="-1" r="2.5"/>}
    </svg>
    <svg className="liquid-toggle-filter" aria-hidden="true"><defs><filter id={filterId}><feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur"/><feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo"/><feComposite in="SourceGraphic" in2="goo" operator="atop"/></filter></defs></svg>
  </label>;
}
