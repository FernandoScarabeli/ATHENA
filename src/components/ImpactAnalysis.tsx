import { ArrowRight, FileDiff, Folder, Sparkles, X } from 'lucide-react';
import { simulatedChange } from '../data/changes';

export function ImpactAnalysis({ onClose, onViewGraph }: { onClose: () => void; onViewGraph: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Simulação de alteração">
      <div className="impact-modal">
        <div className="panel-header"><div><span className="section-kicker">Atualização de documentação</span><h2>Arquivo atualizado</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={17} /></button></div>
        <div className="updated-file-card">
          <span className="file-update-icon"><FileDiff size={18} /></span>
          <div><strong>{simulatedChange.fileName}</strong><small><Folder size={12} /> {simulatedChange.folderName} · atualizado agora</small></div>
        </div>
        <section className="change-summary-card">
          <span className="section-kicker"><Sparkles size={12} /> Resumo da mudança</span>
          <p>{simulatedChange.summary}</p>
          <div className="change-excerpt"><span>Alteração identificada</span><del>{simulatedChange.before}</del><ins>{simulatedChange.after}</ins></div>
        </section>
        <div className="graph-highlight-note">
          <span />
          <p>O arquivo atualizado e as US relacionadas serão destacados em laranja no mapa.</p>
        </div>
        <div className="modal-footer"><span><FileDiff size={14} /> Atualização identificada automaticamente</span><button className="primary-button" onClick={onViewGraph}>Simular mudança <ArrowRight size={15} /></button></div>
      </div>
    </div>
  );
}
