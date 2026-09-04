import { ArrowRight, FileSearch, X } from 'lucide-react';
import { requirementById } from '../data/requirements';
import type { Relation } from '../data/relations';

type Props = { relation: Relation; onClose: () => void; onOpenDocument: (requirementId: string) => void };

export function RelationDetails({ relation, onClose, onOpenDocument }: Props) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Evidência da relação">
      <div className="relation-modal">
        <div className="panel-header"><div><span className="section-kicker">Evidência de relação</span><h2>Por que essas histórias estão relacionadas?</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={17} /></button></div>
        <div className="relation-path"><strong>{requirementById[relation.source].title}</strong><span>{relation.type}<ArrowRight size={13} /></span><strong>{requirementById[relation.target].title}</strong></div>
        <div className="evidence-section"><label>Motivo</label><p>{relation.reason}</p></div>
        <div className="confidence-card"><div><span>Confiança da relação</span><strong>{relation.confidence}%</strong></div><div className="confidence-track"><span style={{ width: `${relation.confidence}%` }} /></div></div>
        <div className="evidence-section"><label>Trecho identificado</label><blockquote>“{relation.evidence}”</blockquote></div>
        <div className="modal-footer"><span>Análise simulada para demonstração</span><button className="primary-button" onClick={() => onOpenDocument(relation.source)}><FileSearch size={15} /> Ver no documento</button></div>
      </div>
    </div>
  );
}
