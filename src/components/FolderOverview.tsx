import { FileText, Folder, GitBranch, SearchX } from 'lucide-react';
import { requirementFolders, requirements } from '../data/requirements';
import { relationCount } from '../data/relations';
import { simulatedChange } from '../data/changes';

type Props = {
  query: string;
  impactMode: boolean;
  onSelectRequirement: (id: string) => void;
};

export function FolderOverview({ query, impactMode, onSelectRequirement }: Props) {
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  const filteredRequirements = normalized
    ? requirements.filter((item) => item.title.toLocaleLowerCase('pt-BR').includes(normalized))
    : requirements;
  const visibleFolders = requirementFolders.filter((folder) => filteredRequirements.some((item) => item.folderId === folder.id));

  if (!visibleFolders.length) {
    return <div className="folder-empty"><SearchX size={24} /><strong>Nenhuma US encontrada</strong><span>Tente buscar por outro termo.</span></div>;
  }

  return (
    <div className="folder-overview">
      <div className="folder-overview-heading">
        <div>
          <span className="section-kicker">Estrutura importada do Drive</span>
          <h1>{normalized ? `Resultados para “${query}”` : impactMode ? 'Atualização detectada na documentação' : 'Requisitos organizados por pasta'}</h1>
          <p>{normalized ? `${filteredRequirements.length} histórias encontradas` : impactMode ? 'O arquivo atualizado e as US relacionadas estão destacados em laranja.' : 'Selecione uma história para revelar sua rede de dependências.'}</p>
        </div>
        <div className="overview-metrics"><span><Folder size={13} /> {visibleFolders.length} pastas</span><span><FileText size={13} /> {filteredRequirements.length} US</span></div>
      </div>

      <div className="folder-grid">
        {visibleFolders.map((folder) => {
          const folderRequirements = filteredRequirements.filter((item) => item.folderId === folder.id);
          return (
            <section className="folder-card" key={folder.id}>
              <header>
                <span className="folder-icon"><Folder size={16} /></span>
                <div><h2>{folder.title}</h2><p>{folder.description}</p></div>
                <span className="folder-count">{folderRequirements.length} US</span>
              </header>
              <div className="folder-requirements">
                {folderRequirements.map((requirement) => (
                  <button
                    key={requirement.id}
                    className={impactMode && requirement.id === simulatedChange.requirementId ? 'us-updated' : impactMode && simulatedChange.impacts.some((impact) => impact.requirementId === requirement.id) ? 'us-related' : ''}
                    onClick={() => onSelectRequirement(requirement.id)}
                  >
                    <span className="us-type">US</span>
                    <span className="us-name">{requirement.title}</span>
                    <span className="us-relations"><GitBranch size={11} /> {relationCount(requirement.id)}</span>
                    {impactMode && requirement.id === simulatedChange.requirementId && <span className="us-change-label">Atualizada</span>}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
