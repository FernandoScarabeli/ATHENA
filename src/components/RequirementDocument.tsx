import { ExternalLink, FileText, X } from 'lucide-react';
import { requirementById } from '../data/requirements';
import { relations } from '../data/relations';

type Props = { requirementId: string; onClose: () => void; onFocusRequirement: (id: string) => void };

export function RequirementDocument({ requirementId, onClose, onFocusRequirement }: Props) {
  const requirement = requirementById[requirementId];
  const outgoing = relations.filter((item) => item.source === requirementId);
  const incoming = relations.filter((item) => item.target === requirementId);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Documento ${requirement.title}`}>
      <div className="document-modal">
        <header className="document-toolbar">
          <div className="document-source"><span className="docs-icon"><FileText size={16} /></span><div><strong>{requirement.source}</strong><small>Última sincronização há 12 min</small></div></div>
          <div className="toolbar-actions"><button>Google Docs <ExternalLink size={14} /></button><button className="icon-button" onClick={onClose} aria-label="Fechar documento"><X size={18} /></button></div>
        </header>
        <div className="document-body">
          <article className="document-page">
            <div className="doc-label">HISTÓRIA DE USUÁRIO</div>
            <h1>{requirement.title.toLocaleUpperCase('pt-BR')}</h1>
            <div className="doc-metadata"><span>Status: <strong>Aprovada</strong></span><span>Responsável: <strong>{requirement.owner}</strong></span><span>Atualizada {requirement.updatedAt}</span></div>
            <DocumentSection title="Descrição"><p>{requirement.description}</p></DocumentSection>
            <DocumentSection title="Contexto">
              <p>Esta história faz parte do fluxo de controle de trânsito animal e deve preservar a integridade dos dados cadastrais e sanitários utilizados no processo.</p>
              <p>O comportamento descrito deve ser aplicado tanto no atendimento presencial quanto no autoatendimento, respeitando as permissões do usuário.</p>
            </DocumentSection>
            <DocumentSection title="Critérios de aceitação">
              <ol>{requirement.acceptanceCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ol>
            </DocumentSection>
            <DocumentSection title="Regras de negócio">
              <ul>{requirement.businessRules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
            </DocumentSection>
            <DocumentSection title="Exceções e mensagens">
              <p>Quando uma validação impedir a continuidade, o sistema deve informar o motivo de forma objetiva e manter os dados já preenchidos pelo usuário.</p>
            </DocumentSection>
          </article>
          <aside className="document-relations">
            <span className="section-kicker">Relações</span>
            <RelationLinks title="Depende de" ids={outgoing.map((item) => item.target)} onFocus={onFocusRequirement} />
            <RelationLinks title="Utilizada por" ids={incoming.map((item) => item.source)} onFocus={onFocusRequirement} />
            <div className="document-note"><strong>Origem da análise</strong><p>Relações identificadas a partir dos critérios de aceitação e regras de negócio.</p></div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function DocumentSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="document-section"><h2>{title}</h2>{children}</section>;
}

function RelationLinks({ title, ids, onFocus }: { title: string; ids: string[]; onFocus: (id: string) => void }) {
  if (!ids.length) return null;
  return <div className="doc-relation-group"><h3>{title}</h3>{ids.map((id) => <button key={id} onClick={() => onFocus(id)}>{requirementById[id].title}</button>)}</div>;
}
