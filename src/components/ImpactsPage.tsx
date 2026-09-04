import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { simulatedChange } from '../data/changes';
import { requirementById } from '../data/requirements';

export function ImpactsPage({ onViewGraph }: { onViewGraph: () => void }) {
  return (
    <div className="list-page">
      <div className="list-heading"><div><span className="section-kicker">Central de análise</span><h1>Impactos</h1><p>Avalie requisitos potencialmente afetados por alterações recentes.</p></div><button className="primary-button" onClick={onViewGraph}>Ver no grafo <ArrowRight size={15} /></button></div>
      <div className="change-banner"><AlertTriangle size={18} /><div><strong>Alteração detectada em Espécie</strong><p>Regra de controle de rebanho ampliada para o grupo Equídeos.</p></div><span>3 em análise</span></div>
      <div className="impact-page-list">
        {simulatedChange.impacts.map((impact) => <div className="impact-page-row" key={impact.requirementId}><span className="status-icon"><AlertTriangle size={16} /></span><div><strong>{requirementById[impact.requirementId].title}</strong><p>{impact.reason}</p></div><span className={`severity ${impact.level}`}>{impact.level}</span><strong>{impact.confidence}%</strong><button onClick={onViewGraph}>Analisar <ArrowRight size={13} /></button></div>)}
      </div>
      <div className="resolved-note"><CheckCircle2 size={15} /> As decisões desta demonstração ficam apenas no navegador e são reiniciadas ao recarregar.</div>
    </div>
  );
}
