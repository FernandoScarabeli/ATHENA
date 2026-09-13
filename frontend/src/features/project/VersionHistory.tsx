import { useMemo, useState } from 'react';
import { ChevronDown, Eye, History } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { RequirementVersion } from '../../lib/types';

function versionLabel(version: RequirementVersion) {
  return `Revisão ${version.revision}${version.current ? ' (atual)' : ''}`;
}

function versionDate(value?: string) {
  if (!value) return 'Data não registrada';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
}

export function VersionHistory({ requirementId, selectedRevision, onSelectVersion }: { requirementId: string; selectedRevision?: number | null; onSelectVersion: (version: RequirementVersion) => void }) {
  const versions = useQuery<RequirementVersion[]>({ queryKey: ['versions', requirementId], queryFn: () => api(`/requirements/${requirementId}/versions`) });
  const ordered = useMemo(() => (versions.data ?? []).filter((version, index, all) => all.findIndex(item => item.revision === version.revision) === index), [versions.data]);
  const [olderOpen, setOlderOpen] = useState(true);
  if (versions.isLoading) return <p className="section-help">Carregando histórico…</p>;
  if (versions.isError) return <p className="inline-error" role="alert">Não foi possível carregar o histórico.</p>;
  if (!ordered.length) return <p className="empty-copy">Nenhuma revisão disponível.</p>;
  const [current, ...older] = ordered;
  return <div className="version-history">
    <p className="version-history-intro">Escolha uma revisão anterior para visualizá-la no documento.</p>
    <article className="version-current" aria-label={versionLabel(current)}><span className="version-current-icon"><History size={16}/></span><span><strong>{versionLabel(current)}</strong><small>{versionDate(current.createdAt)}</small></span><em>Atual</em></article>
    {older.length > 0 && <section className="version-archive">
      <button type="button" className="version-archive-trigger" aria-expanded={olderOpen} aria-controls="older-versions" onClick={() => setOlderOpen((open) => !open)}><span>Revisões anteriores</span><span className="version-archive-count">{older.length}</span><ChevronDown size={16}/></button>
      <div id="older-versions" className={`version-archive-list ${olderOpen ? 'is-open' : ''}`}><div>{older.map((version) => <button type="button" className={`version-row ${selectedRevision === version.revision ? 'selected' : ''}`} key={version.revision} aria-current={selectedRevision === version.revision ? 'page' : undefined} onClick={() => onSelectVersion(version)}><span><strong>{versionLabel(version)}</strong><small>{versionDate(version.createdAt)}</small></span><Eye size={16}/></button>)}</div></div>
    </section>}
  </div>;
}
