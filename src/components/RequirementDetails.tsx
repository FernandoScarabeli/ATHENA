import { AlertTriangle, ArrowUpRight, Check, ExternalLink, FileText, GitBranch, X } from 'lucide-react';
import { requirementById } from '../data/requirements';
import { relations, type Relation } from '../data/relations';
import { simulatedChange } from '../data/changes';

type Props = {
  requirementId: string;
  impactMode: boolean;
  impactState?: 'impacted' | 'confirmed' | 'dismissed';
  onClose: () => void;
  onOpenDocument: () => void;
  onFocusRequirement: (id: string) => void;
  onOpenRelation: (relation: Relation) => void;
  onResolveImpact: (state: 'confirmed' | 'dismissed') => void;
};

export function RequirementDetails({ requirementId, impactMode, impactState, onClose, onOpenDocument, onFocusRequirement, onOpenRelation, onResolveImpact }: Props) {
  const requirement = requirementById[requirementId];
  const outgoing = relations.filter((item) => item.source === requirementId);
  const incoming = relations.filter((item) => item.target === requirementId);
  const impact = simulatedChange.impacts.find((item) => item.requirementId === requirementId);

  return (
    <aside className="details-panel">
      <div className="panel-header">
        <div><span className="section-kicker">Requisito selecionado</span><h2>{requirement.title}</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Fechar painel"><X size={17} /></button>
      </div>
      <div className="type-row"><span className="type-badge">US</span><span>Atualizada {requirement.updatedAt}</span></div>

      <div className="panel-actions">
        <button className="primary-button" onClick={onOpenDocument}><FileText size={15} /> Abrir requisito</button>
        <a className="secondary-button" href="#documento-mock" onClick={(event) => event.preventDefault()}>Google Docs <ExternalLink size={14} /></a>
      </div>

      {impactMode && impact && (
        <div className={`impact-inline ${impactState === 'confirmed' ? 'is-confirmed' : ''} ${impactState === 'dismissed' ? 'is-dismissed' : ''}`}>
          <div className="impact-inline-title">
            {impactState === 'confirmed' ? <Check size={15} /> : <AlertTriangle size={15} />}
            {impactState === 'confirmed' ? 'IMPACTO CONFIRMADO' : impactState === 'dismissed' ? 'MARCARDO COMO NÃO IMPACTADO' : 'POSSÍVEL IMPACTO'}
          </div>
          <p>{impact.reason}</p>
          <div className="confidence-row"><span>Confiança</span><strong>{impact.confidence}%</strong></div>
          {!impactState || impactState === 'impacted' ? (
            <div className="decision-actions">
              <button onClick={() => onResolveImpact('confirmed')}>Confirmar impacto</button>
              <button onClick={() => onResolveImpact('dismissed')}>Não impacta</button>
            </div>
          ) : null}
        </div>
      )}

      <RelationGroup title="Depende de" relations={outgoing} getOtherId={(relation) => relation.target} onFocus={onFocusRequirement} onOpenRelation={onOpenRelation} />
      <RelationGroup title="É utilizada por" relations={incoming} getOtherId={(relation) => relation.source} onFocus={onFocusRequirement} onOpenRelation={onOpenRelation} />

      <div className="panel-section">
        <div className="panel-section-title"><span>Impactos</span><span className="count-pill">{impactMode && impact ? '1' : requirementId === 'emissao-gta' ? '1' : '0'}</span></div>
        {impactMode && impact ? (
          <button className="impact-link"><AlertTriangle size={14} /> Regra alterada em Espécie <ArrowUpRight size={13} /></button>
        ) : requirementId === 'emissao-gta' ? (
          <button className="impact-link"><AlertTriangle size={14} /> 1 possível impacto <ArrowUpRight size={13} /></button>
        ) : <p className="empty-copy">Nenhum impacto em análise.</p>}
      </div>

      <div className="source-foot"><GitBranch size={13} /><span>{requirement.source}</span></div>
    </aside>
  );
}

function RelationGroup({ title, relations: groupRelations, getOtherId, onFocus, onOpenRelation }: {
  title: string;
  relations: Relation[];
  getOtherId: (relation: Relation) => string;
  onFocus: (id: string) => void;
  onOpenRelation: (relation: Relation) => void;
}) {
  if (!groupRelations.length) return null;
  return (
    <div className="panel-section">
      <div className="panel-section-title"><span>{title}</span><span className="count-pill">{groupRelations.length}</span></div>
      <div className="relation-list">
        {groupRelations.map((relation) => {
          const otherId = getOtherId(relation);
          return (
            <div className="relation-row" key={relation.id}>
              <button onClick={() => onFocus(otherId)}>{requirementById[otherId].title}</button>
              <button className="relation-kind" onClick={() => onOpenRelation(relation)} title="Ver evidência da relação">{relation.type}<ArrowUpRight size={11} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
