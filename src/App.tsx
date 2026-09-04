import { useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  Database,
  Folder,
  GitBranch,
  Link2,
  Map,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { AnalysisLoading } from './components/AnalysisLoading';
import { FolderOverview } from './components/FolderOverview';
import { ImpactAnalysis } from './components/ImpactAnalysis';
import { ImpactsPage } from './components/ImpactsPage';
import { RelationDetails } from './components/RelationDetails';
import { RequirementDetails } from './components/RequirementDetails';
import { RequirementDocument } from './components/RequirementDocument';
import { RequirementGraph } from './components/RequirementGraph';
import { requirementById } from './data/requirements';
import { relationCount, type Relation } from './data/relations';

type AppScreen = 'connect' | 'analysis' | 'workspace';
type WorkspaceView = 'map' | 'impacts';
type ImpactDecision = 'impacted' | 'confirmed' | 'dismissed';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('connect');
  const [driveUrl, setDriveUrl] = useState('https://drive.google.com/drive/folders/exemplo');
  const [urlError, setUrlError] = useState('');
  const [view, setView] = useState<WorkspaceView>('map');
  const [query, setQuery] = useState('');
  const [graphRoot, setGraphRoot] = useState<string | null>(null);
  const [selectedRequirement, setSelectedRequirement] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [selectedRelation, setSelectedRelation] = useState<Relation | null>(null);
  const [showImpactSimulation, setShowImpactSimulation] = useState(false);
  const [impactMode, setImpactMode] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [impactStates, setImpactStates] = useState<Record<string, ImpactDecision>>({});

  const analyze = (event: React.FormEvent) => {
    event.preventDefault();
    const looksLikeDrive = /^https?:\/\/(?:www\.)?drive\.google\.com\//i.test(driveUrl.trim());
    if (!looksLikeDrive) {
      setUrlError('Cole um link com aparência de pasta do Google Drive para continuar.');
      return;
    }
    setUrlError('');
    setScreen('analysis');
  };

  const focusRequirement = (id: string) => {
    setView('map');
    setGraphRoot(id);
    setSelectedRequirement(id);
    setFocusId(id);
    setDocumentId(null);
  };

  const viewImpactsOnGraph = () => {
    setShowImpactSimulation(false);
    setImpactMode(true);
    setView('map');
    setQuery('');
    setGraphRoot('especie');
    setSelectedRequirement(null);
    setFocusId('especie');
  };

  const simulateChangeInFolders = () => {
    setShowImpactSimulation(false);
    setImpactMode(true);
    setView('map');
    setQuery('');
    setGraphRoot(null);
    setSelectedRequirement(null);
    setFocusId(null);
  };

  if (screen === 'connect') {
    return (
      <main className="landing-page">
        <header className="landing-nav">
          <Brand />
          <span className="demo-badge">Ambiente de demonstração</span>
        </header>

        <section className="landing-content">
          <div className="eyebrow"><Sparkles size={14} /> Rastreabilidade inteligente</div>
          <h1>Entenda como seus requisitos estão conectados</h1>
          <p className="landing-lead">Conecte sua documentação e visualize automaticamente dependências e possíveis impactos entre requisitos.</p>

          <form className="drive-form" onSubmit={analyze}>
            <label htmlFor="drive-url">Link da pasta do Google Drive</label>
            <div className="drive-input-row">
              <div className={`input-wrap ${urlError ? 'has-error' : ''}`}><Link2 size={18} /><input id="drive-url" value={driveUrl} onChange={(event) => setDriveUrl(event.target.value)} aria-describedby="drive-hint" /></div>
              <button type="submit">Analisar requisitos <ArrowRight size={16} /></button>
            </div>
            {urlError ? <span className="form-error">{urlError}</span> : <span id="drive-hint" className="form-hint"><ShieldCheck size={13} /> Nesta demonstração, nenhum documento real será acessado.</span>}
          </form>

          <FolderPreview />
          <div className="trust-row">
            <span><Database size={14} /> 100 documentos</span>
            <span><GitBranch size={14} /> 202 relações identificadas</span>
            <span><Sparkles size={14} /> análise mockada para demonstração</span>
          </div>
        </section>
      </main>
    );
  }

  if (screen === 'analysis') return <AnalysisLoading onDone={() => setScreen('workspace')} />;

  return (
    <ReactFlowProvider>
      <div className="app-shell">
        <aside className="sidebar">
          <Brand compact />
          <nav aria-label="Navegação principal">
            <SidebarButton icon={<Map size={16} />} label="Mapa" active={view === 'map'} onClick={() => setView('map')} />
            <SidebarButton icon={<AlertTriangle size={16} />} label="Impactos" active={view === 'impacts'} count={impactMode ? 3 : undefined} onClick={() => setView('impacts')} />
          </nav>
          <div className="sidebar-project">
            <span className="section-kicker">Fonte conectada</span>
            <div className="source-row"><span className="drive-dot" /><div><strong>Requisitos</strong><small>8 pastas · 100 documentos</small></div></div>
          </div>
          <div className="sidebar-foot"><span className="avatar">FS</span><div><strong>Projeto GTA</strong><small>Workspace demo</small></div></div>
        </aside>

        <div className="workspace">
          <header className="topbar">
            <div className="workspace-title"><span>Defesa Agropecuária</span><span>/</span><strong>{view === 'map' ? 'Mapa de requisitos' : 'Impactos'}</strong></div>
            <div className="topbar-actions">
              <label className="search-box"><Search size={15} /><input value={query} onChange={(event) => { setQuery(event.target.value); setView('map'); setGraphRoot(null); setSelectedRequirement(null); setFocusId(null); setImpactMode(false); }} placeholder="Buscar requisito…" aria-label="Buscar requisito" /><kbd>⌘ K</kbd></label>
              <button className="simulate-button" onClick={() => setShowImpactSimulation(true)}><Sparkles size={15} /> Simular alteração</button>
            </div>
          </header>

          <main className="workspace-content">
            {view === 'map' && (
              <section className={`map-page ${selectedRequirement ? 'has-panel' : ''}`}>
                {!graphRoot ? (
                  <FolderOverview
                    query={query}
                    impactMode={impactMode}
                    onSelectRequirement={(id) => {
                      setGraphRoot(id);
                      setSelectedRequirement(null);
                      setFocusId(id);
                    }}
                  />
                ) : (
                  <>
                    <div className="map-toolbar graph-mode-toolbar">
                      <div className="graph-heading">
                        <button className="back-to-folders" onClick={() => { setGraphRoot(null); setSelectedRequirement(null); setSelectedRelation(null); setFocusId(null); setImpactMode(false); }}><ChevronLeft size={14} /> Pastas</button>
                        <div><h1>{requirementById[graphRoot].title}</h1><span>{relationCount(graphRoot)} relações diretas · dependências e dependentes</span></div>
                      </div>
                      <div className="map-status"><span className="status-live" /> Rede construída a partir da US selecionada</div>
                    </div>
                    <div className="graph-side-label dependent-label">Histórias dependentes</div>
                    <div className="graph-side-label dependency-label">Dependências utilizadas</div>
                    <RequirementGraph
                      rootId={graphRoot}
                      query={query}
                      focusId={focusId}
                      selectedRelationId={selectedRelation?.id || null}
                      impactMode={impactMode}
                      impactStates={impactStates}
                      onSelectRequirement={(id) => { setSelectedRequirement(id); setFocusId(null); }}
                      onSelectRelation={(relation) => setSelectedRelation(relation)}
                    />
                  </>
                )}
                {impactMode && graphRoot && <ImpactLegend onClose={() => { setImpactMode(false); setImpactStates({}); }} />}
                {selectedRequirement && (
                  <RequirementDetails
                    requirementId={selectedRequirement}
                    impactMode={impactMode}
                    impactState={impactStates[selectedRequirement]}
                    onClose={() => setSelectedRequirement(null)}
                    onOpenDocument={() => setDocumentId(selectedRequirement)}
                    onFocusRequirement={focusRequirement}
                    onOpenRelation={setSelectedRelation}
                    onResolveImpact={(decision) => setImpactStates((current) => ({ ...current, [selectedRequirement]: decision }))}
                  />
                )}
              </section>
            )}
            {view === 'impacts' && <ImpactsPage onViewGraph={viewImpactsOnGraph} />}
          </main>
        </div>
      </div>

      {showImpactSimulation && <ImpactAnalysis onClose={() => setShowImpactSimulation(false)} onViewGraph={simulateChangeInFolders} />}
      {selectedRelation && <RelationDetails relation={selectedRelation} onClose={() => setSelectedRelation(null)} onOpenDocument={(id) => { setSelectedRelation(null); setDocumentId(id); }} />}
      {documentId && <RequirementDocument requirementId={documentId} onClose={() => setDocumentId(null)} onFocusRequirement={focusRequirement} />}
    </ReactFlowProvider>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <a className={`brand ${compact ? 'brand-compact' : ''}`} href="#" onClick={(event) => event.preventDefault()} aria-label="RequisitoGraph"><span className="brand-mark"><GitBranch size={17} /></span><span>Requisito<span className="brand-muted">Graph</span></span></a>;
}

function SidebarButton({ icon, label, active, count, onClick }: { icon: React.ReactNode; label: string; active: boolean; count?: number; onClick: () => void }) {
  return <button className={active ? 'active' : ''} onClick={onClick}>{icon}<span>{label}</span>{count ? <strong className="nav-count">{count}</strong> : null}</button>;
}

function ImpactLegend({ onClose }: { onClose: () => void }) {
  return <div className="impact-legend"><div className="legend-title"><span>Atualização detectada</span><button onClick={onClose}>Encerrar</button></div><div><span className="legend-dot changed" /> Arquivo atualizado</div><div><span className="legend-dot impacted" /> US relacionada</div><div><span className="legend-dot unrelated" /> Não relacionada</div></div>;
}

function FolderPreview() {
  const previews = [
    { title: 'Ready — Trânsito Animal', items: ['Emissão de GTA', 'Recebimento de GTA', 'Cancelamento de GTA', 'Finalidade de Trânsito'] },
    { title: 'Ready — Espécies', items: ['Espécie', 'Vacinação', 'Doença', 'Saldo de rebanho'] },
    { title: 'Ready — Cadastros', items: ['Produtor', 'Pessoa Física/Jurídica', 'Estabelecimento', 'Responsável técnico'] },
  ];
  return (
    <div className="preview-window" aria-hidden="true">
      <div className="preview-top"><span /><span /><span /><div className="preview-title">Requisitos organizados por pasta</div></div>
      <div className="preview-folder-grid">
        {previews.map((folder) => <div className="preview-folder" key={folder.title}><header><Folder size={13} /><strong>{folder.title}</strong><span>13 US</span></header><div>{folder.items.map((item) => <span key={item}><small>US</small>{item}</span>)}</div></div>)}
      </div>
    </div>
  );
}
