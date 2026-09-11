import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import type { Requirement, RequirementRelation } from '../../lib/types';

const statusLabels = { DRAFT: 'Rascunho', ACTIVE: 'Ativo', ARCHIVED: 'Arquivado' } as const;
const relationLabels = { RELATED_TO: 'Relacionado a', DEPENDS_ON: 'Depende de', BLOCKS: 'Bloqueia', CONFLICTS_WITH: 'Conflita com' } as const;

export function RequirementDrawer({ requirement, onClose, onSelect, onEdit }: { requirement: Requirement; onClose: () => void; onSelect: (id: string) => void; onEdit?: () => void }) {
  const relations = useQuery<RequirementRelation[]>({ queryKey: ['relations', requirement.id], queryFn: () => api(`/requirements/${requirement.id}/relations`) });
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  return (
    <aside className="details-panel" aria-label={`Detalhes de ${requirement.code}`}>
      <header className="panel-header"><div><span className="section-kicker">{requirement.code}</span><h2>{requirement.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar detalhes"><Icon name="close" size={16}/></button></header>
      <div className="type-row"><span className="type-badge">US</span><span>{statusLabels[requirement.status]}</span><span>Revisão {requirement.revision}</span></div>
      <section className="panel-section"><div className="panel-section-title"><span>Critérios de aceite</span><span className="count-pill">{requirement.criteria.length}</span></div>{requirement.criteria.length ? <ol className="criteria-list">{requirement.criteria.map((criterion, index) => <li key={criterion.id ?? index}>{criterion.title && <strong>{criterion.title}: </strong>}{criterion.given || criterion.whenText || criterion.thenText ? <>Dado {criterion.given || '—'}, quando {criterion.whenText || '—'}, então {criterion.thenText || criterion.text || '—'}.</> : criterion.text}</li>)}</ol> : <p className="empty-copy">Nenhum critério cadastrado.</p>}</section>
      <section className="panel-section"><div className="panel-section-title"><span>Relações</span><span className="count-pill">{relations.data?.length ?? 0}</span></div>{relations.isLoading && <p className="empty-copy">Carregando relações…</p>}{relations.isError && <div className="compact-error">{relations.error.message}</div>}{relations.data?.length === 0 && <p className="empty-copy">Nenhuma relação cadastrada.</p>}<div className="relation-list">{relations.data?.map((relation) => { const other = relation.sourceId === requirement.id ? relation.target : relation.source; return <button className="relation-row" key={relation.id} onClick={() => onSelect(other.id)}><span><strong>{other.code}</strong>{other.title}</span><small>{relationLabels[relation.type]} <Icon name="chevron" size={10}/></small></button>; })}</div></section>
      <section className="panel-section metadata-grid"><div><span>Pasta</span><strong>{requirement.folder?.name ?? 'Sem pasta'}</strong></div><div><span>Origem</span><strong>{requirement.source}</strong></div></section>
      {onEdit && <button className="primary-button" style={{ width: '100%', marginTop: 16 }} onClick={onEdit}>Abrir requisito</button>}
    </aside>
  );
}
