import { useEffect, useState } from 'react';
import { Check, FileSearch, FolderSearch, GitBranch, LoaderCircle, Sparkles } from 'lucide-react';

const steps = [
  'Conectando ao Google Drive',
  '100 documentos encontrados em 8 pastas',
  'Lendo histórias de usuário',
  'Identificando regras e dependências',
  'Construindo mapa de requisitos',
];

export function AnalysisLoading({ onDone }: { onDone: () => void }) {
  const [completed, setCompleted] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCompleted((current) => {
        if (current >= steps.length) {
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, 620);
    return () => window.clearInterval(timer);
  }, []);

  const done = completed >= steps.length;
  return (
    <div className="analysis-screen">
      <div className="analysis-dialog">
        <div className={`analysis-symbol ${done ? 'done' : ''}`}>{done ? <Check size={24} /> : <LoaderCircle size={24} className="spin" />}</div>
        <span className="section-kicker">Análise de documentação</span>
        <h1>{done ? 'Análise concluída' : 'Entendendo seus requisitos'}</h1>
        <p>{done ? 'Seu mapa de rastreabilidade está pronto para ser explorado.' : 'Estamos simulando a leitura e a identificação de relações entre os documentos.'}</p>

        {!done ? (
          <div className="analysis-steps">
            {steps.map((step, index) => {
              const isComplete = index < completed;
              const isCurrent = index === completed;
              return <div className={`analysis-step ${isComplete ? 'complete' : ''} ${isCurrent ? 'current' : ''}`} key={step}><span>{isComplete ? <Check size={13} /> : isCurrent ? <LoaderCircle size={13} className="spin" /> : null}</span><p>{step}</p></div>;
            })}
          </div>
        ) : (
          <div className="analysis-result">
            <div><FileSearch size={18} /><strong>100</strong><span>requisitos encontrados</span></div>
            <div><GitBranch size={18} /><strong>202</strong><span>relações identificadas</span></div>
            <div><Sparkles size={18} /><strong>3</strong><span>possíveis impactos</span></div>
          </div>
        )}

        {done ? <button className="analysis-cta" onClick={onDone}>Ver mapa <GitBranch size={16} /></button> : <div className="analysis-foot"><FolderSearch size={14} /> Pasta: Requisitos — Defesa Agropecuária</div>}
      </div>
    </div>
  );
}
