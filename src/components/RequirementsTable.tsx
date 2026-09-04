import { ArrowUpRight, FileText, GitBranch } from 'lucide-react';
import { requirements } from '../data/requirements';
import { relationCount } from '../data/relations';

export function RequirementsTable({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <div className="list-page">
      <div className="list-heading"><div><span className="section-kicker">Documentação analisada</span><h1>Requisitos</h1><p>15 histórias de usuário encontradas na pasta conectada.</p></div><span className="sync-status">Sincronizado há 12 min</span></div>
      <div className="requirements-table">
        <div className="table-head"><span>Requisito</span><span>Equipe</span><span>Atualização</span><span>Relações</span><span /></div>
        {requirements.map((item) => <button className="table-row" key={item.id} onClick={() => onOpen(item.id)}><span className="table-title"><FileText size={15} /><span><strong>{item.title}</strong><small>{item.source.split(' · ')[0]}</small></span></span><span>{item.owner}</span><span>{item.updatedAt}</span><span className="relation-total"><GitBranch size={13} /> {relationCount(item.id)}</span><span><ArrowUpRight size={14} /></span></button>)}
      </div>
    </div>
  );
}
