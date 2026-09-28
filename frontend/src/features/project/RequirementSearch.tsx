import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import type { Requirement } from '../../lib/types';

type Props = {
  requirements: Requirement[];
  excludedIds: ReadonlySet<string>;
  selectedId: string;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onSelect: (id: string) => void;
};

/** A reusable project requirement picker; callers decide how to load and exclude results. */
export function RequirementSearch({ requirements, excludedIds, selectedId, loading = false, error, onRetry, onSelect }: Props) {
  const listId = useId();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = requirements.find((requirement) => requirement.id === selectedId);
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  const results = useMemo(() => requirements.filter((requirement) => requirement.status !== 'ARCHIVED' && !excludedIds.has(requirement.id) && (!normalized || `${requirement.code} ${requirement.title}`.toLocaleLowerCase('pt-BR').includes(normalized))), [excludedIds, normalized, requirements]);
  const visibleResults = results.slice(0, 8);

  const choose = (id: string) => { onSelect(id); setQuery(''); setActiveIndex(0); };
  const changeSelection = () => { onSelect(''); setQuery(''); requestAnimationFrame(() => input.current?.focus()); };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && visibleResults.length) { event.preventDefault(); setActiveIndex((index) => (index + 1) % visibleResults.length); }
    else if (event.key === 'ArrowUp' && visibleResults.length) { event.preventDefault(); setActiveIndex((index) => (index - 1 + visibleResults.length) % visibleResults.length); }
    else if (event.key === 'Enter' && visibleResults.length) { event.preventDefault(); choose(visibleResults[activeIndex]?.id ?? visibleResults[0].id); }
    else if (event.key === 'Escape') { event.preventDefault(); if (query) setQuery(''); else input.current?.blur(); }
  };

  if (selected) return <div className="requirement-search-selected"><Search size={15} aria-hidden="true"/><span><strong>{selected.code}</strong><small>{selected.title}</small></span><button type="button" aria-label="Trocar US selecionada" onClick={changeSelection}><X size={15}/></button></div>;

  return <div className="requirement-search">
    <label htmlFor={inputId}>Buscar US pelo código ou nome</label>
    <div className="requirement-search-input"><Search size={16} aria-hidden="true"/><input ref={input} id={inputId} role="combobox" aria-label="Buscar US pelo código ou nome" aria-autocomplete="list" aria-expanded="true" aria-controls={listId} aria-activedescendant={results.length ? `${listId}-option-${activeIndex}` : undefined} value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={handleKeyDown} placeholder="Ex.: US-012 ou cadastro de pacientes" autoComplete="off" /></div>
    {loading && <p className="requirement-search-feedback" role="status">Carregando US…</p>}
    {error && <div className="requirement-search-feedback" role="alert"><span>Não foi possível carregar as US. {error.message}</span>{onRetry && <button type="button" onClick={onRetry}>Tentar novamente</button>}</div>}
    {!loading && !error && !normalized && <p className="requirement-search-feedback">Digite o código ou o nome da US.</p>}
    {!loading && !error && normalized && results.length === 0 && <p className="requirement-search-feedback">Nenhuma US encontrada.</p>}
    <div className={`requirement-search-results ${visibleResults.length ? '' : 'is-empty'}`} id={listId} role="listbox" aria-label="Resultados da busca">
      {!error && visibleResults.map((requirement, index) => <button key={requirement.id} id={`${listId}-option-${index}`} type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? 'is-active' : ''} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(requirement.id)}><strong>{requirement.code}</strong><span>{requirement.title}</span></button>)}
    </div>
  </div>;
}
