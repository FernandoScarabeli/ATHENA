import { useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import {
  AlertTriangle,
  ArrowRight,
  Database,
  GitBranch,
  LayoutList,
  Link2,
  Map,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { AnalysisLoading } from './components/AnalysisLoading';
import { ImpactAnalysis } from './components/ImpactAnalysis';
import { ImpactsPage } from './components/ImpactsPage';
import { RelationDetails } from './components/RelationDetails';
import { RequirementDetails } from './components/RequirementDetails';
import { RequirementDocument } from './components/RequirementDocument';
import { RequirementGraph } from './components/RequirementGraph';
import { RequirementsTable } from './components/RequirementsTable';
import { requirementById } from './data/requirements';
import type { Relation } from './data/relations';

type AppScreen = 'connect' | 'analysis' | 'workspace';
type WorkspaceView = 'map' | 'requirements' | 'impacts';
type ImpactDecision = 'impacted' | 'confirmed' | 'dismissed';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('connect');
  const [driveUrl, setDriveUrl] = useState('https://drive.google.com/drive/folders/exemplo');
  const [urlError, setUrlError] = useState('');
  const [view, setView] = useState<WorkspaceView>('map');
  const [query, setQuery] = useState('');
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
    setSelectedRequirement(id);
    setFocusId(id);
    setDocumentId(null);
  };

  const viewImpactsOnGraph = () => {
    setShowImpactSimulation(false);
    setImpactMode(true);
    setView('map');
    setQuery('');
    setSelectedRequirement(null);
    setFocusId('especie');
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

          <GraphPreview />
          <div className="trust-row">
            <span><Database size={14} /> 15 documentos</span>
            <span><GitBranch size={14} /> 32 relações identificadas</span>
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
            <SidebarButton icon={<LayoutList size={16} />} label="Requisitos" active={view === 'requirements'} onClick={() => setView('requirements')} />
            <SidebarButton icon={<AlertTriangle size={16} />} label="Impactos" active={view === 'impacts'} count={impactMode ? 3 : undefined} onClick={() => setView('impacts')} />
          </nav>
          <div className="sidebar-project">
            <span className="section-kicker">Fonte conectada</span>
            <div className="source-row"><span className="drive-dot" /><div><strong>Requisitos</strong><small>15 documentos</small></div></div>
          </div>
          <div className="sidebar-foot"><span className="avatar">FS</span><div><strong>Projeto GTA</strong><small>Workspace demo</small></div></div>
        </aside>

        <div className="workspace">
          <header className="topbar">
            <div className="workspace-title"><span>Defesa Agropecuária</span><span>/</span><strong>{view === 'map' ? 'Mapa de requisitos' : view === 'requirements' ? 'Requisitos' : 'Impactos'}</strong></div>
            <div className="topbar-actions">
              <label className="search-box"><Search size={15} /><input value={query} onChange={(event) => { setQuery(event.target.value); setView('map'); setFocusId(null); }} placeholder="Buscar requisito…" aria-label="Buscar requisito" /><kbd>⌘ K</kbd></label>
              <button className="simulate-button" onClick={() => setShowImpactSimulation(true)}><Sparkles size={15} /> Simular alteração</button>
            </div>
          </header>

          <main className="workspace-content">
            {view === 'map' && (
              <section className={`map-page ${selectedRequirement ? 'has-panel' : ''}`}>
                <div className="map-toolbar">
                  <div><h1>Mapa de requisitos</h1><span>15 requisitos · 32 relações</span></div>
                  <div className="map-status"><span className="status-live" /> Sincronizado há 12 min</div>
                </div>
                <RequirementGraph
                  query={query}
                  focusId={focusId}
                  selectedRelationId={selectedRelation?.id || null}
                  impactMode={impactMode}
                  impactStates={impactStates}
                  onSelectRequirement={(id) => { setSelectedRequirement(id); setFocusId(null); }}
                  onSelectRelation={(relation) => setSelectedRelation(relation)}
                />
                {query && <div className="search-result-note">{Object.values(requirementById).filter((item) => item.title.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))).length} requisitos encontrados para “{query}”</div>}
                {impactMode && <ImpactLegend onClose={() => { setImpactMode(false); setImpactStates({}); }} />}
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
            {view === 'requirements' && <RequirementsTable onOpen={focusRequirement} />}
            {view === 'impacts' && <ImpactsPage onViewGraph={viewImpactsOnGraph} />}
          </main>
        </div>
      </div>

      {showImpactSimulation && <ImpactAnalysis onClose={() => setShowImpactSimulation(false)} onViewGraph={viewImpactsOnGraph} />}
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
  return <div className="impact-legend"><div className="legend-title"><span>Análise de impacto</span><button onClick={onClose}>Encerrar</button></div><div><span className="legend-dot changed" /> Alterado</div><div><span className="legend-dot impacted" /> Possível impacto</div><div><span className="legend-dot unrelated" /> Não relacionado à mudança</div></div>;
}

function GraphPreview() {
  return (
    <div className="preview-window" aria-hidden="true">
      <div className="preview-top"><span /><span /><span /><div className="preview-title">Mapa de requisitos</div></div>
      <div className="preview-canvas">
        <div className="fake-node primary" style={{ left: '41%', top: '38%' }}><small>US</small><strong>Emissão de GTA</strong><span>8 relações</span></div>
        <div className="fake-node" style={{ left: '10%', top: '20%' }}><small>US</small><strong>Produtor</strong><span>4 relações</span></div>
        <div className="fake-node" style={{ left: '13%', top: '66%' }}><small>US</small><strong>Exploração Pecuária</strong><span>6 relações</span></div>
        <div className="fake-node" style={{ right: '8%', top: '15%' }}><small>US</small><strong>Espécie</strong><span>7 relações</span></div>
        <div className="fake-node" style={{ right: '5%', top: '65%' }}><small>US</small><strong>Vacinação</strong><span>4 relações</span></div>
        <svg className="fake-lines" viewBox="0 0 900 380" preserveAspectRatio="none"><path d="M220 95 C360 95 330 170 410 185" /><path d="M250 285 C350 275 350 220 410 205" /><path d="M555 185 C650 155 680 80 740 75" /><path d="M555 205 C650 230 670 295 745 300" /><path d="M235 105 C350 40 640 45 740 70" /></svg>
      </div>
    </div>
  );
}
