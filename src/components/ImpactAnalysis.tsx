import { AlertTriangle, ArrowRight, FileDiff, X } from 'lucide-react';
import { simulatedChange } from '../data/changes';
import { requirementById } from '../data/requirements';

export function ImpactAnalysis({ onClose, onViewGraph }: { onClose: () => void; onViewGraph: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Simulação de alteração">
      <div className="impact-modal">
        <div className="panel-header"><div><span className="section-kicker">Simulação de mudança</span><h2>Alteração detectada em Espécie</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={17} /></button></div>
        <div className="change-comparison">
          <div><span className="change-label before">Antes</span><p>{simulatedChange.before}</p></div>
          <div className="change-arrow"><ArrowRight size={17} /></div>
          <div><span className="change-label after">Depois</span><p>{simulatedChange.after}</p></div>
        </div>
        <div className="impact-summary-title"><div><AlertTriangle size={17} /><strong>3 requisitos podem ter sido impactados</strong></div><span>Análise baseada nas relações existentes</span></div>
        <div className="impact-list">
          {simulatedChange.impacts.map((impact) => (
            <div key={impact.requirementId} className="impact-item">
              <span className="impact-dot" />
              <div><strong>{requirementById[impact.requirementId].title}</strong><small>{impact.reason}</small></div>
              <span className={`severity ${impact.level}`}>impacto {impact.level}</span>
              <strong className="impact-confidence">{impact.confidence}%</strong>
            </div>
          ))}
        </div>
        <div className="modal-footer"><span><FileDiff size={14} /> Comparação e impactos simulados</span><button className="primary-button" onClick={onViewGraph}>Ver no grafo <ArrowRight size={15} /></button></div>
      </div>
    </div>
  );
}
