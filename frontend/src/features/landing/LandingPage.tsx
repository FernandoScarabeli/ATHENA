import { ArrowDownRight, ArrowRight, Check, ChevronRight, CircleDotDashed, FileText, GitPullRequest, ShieldCheck } from "lucide-react";
import { Brand } from "../../components/Brand";
import { RequirementConstellation } from "./RequirementConstellation";

const navigate = (path: string) => { window.history.pushState({}, "", path); window.dispatchEvent(new PopStateEvent("popstate")); };

export function LandingPage() {
  return <main className="landing-page">
    <header className="landing-nav">
      <button className="brand-link" type="button" onClick={() => navigate("/")} aria-label="ATHENA, página inicial"><Brand /></button>
      <nav aria-label="Navegação principal"><a href="#impacto">Impacto</a><a href="#revisao">Revisão</a><button className="landing-login" type="button" onClick={() => navigate("/login")}>Entrar <ArrowRight size={15}/></button></nav>
    </header>

    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="hero-copy">
        <p className="landing-overline">Rastreabilidade que acompanha a mudança</p>
        <h1 id="landing-title">Quando um requisito muda,<br />o contexto aparece.</h1>
        <p className="hero-lead">ATHENA revela as relações que merecem revisão antes que uma decisão se propague sem ser percebida.</p>
        <div className="hero-actions"><button type="button" className="landing-primary" onClick={() => navigate("/cadastro")}>Criar conta <ArrowRight size={17}/></button><a href="#impacto" className="landing-secondary">Ver como funciona <ArrowDownRight size={17}/></a></div>
      </div>
      <div className="constellation-frame hero-constellation">
        <div className="constellation-meta"><span>Mapa de relações</span><strong><i/> alteração detectada</strong></div>
        <RequirementConstellation />
        <div className="constellation-callout"><span>REQ-142 mudou</span><strong>3 possíveis impactos</strong><small>revisar antes de publicar</small></div>
      </div>
    </section>

    <section id="impacto" className="landing-section change-story" aria-labelledby="change-title">
      <div className="section-intro"><p className="landing-overline">Uma alteração não termina em um cartão</p><h2 id="change-title">O que precisa ser visto<br />surge junto da mudança.</h2></div>
      <div className="change-ledger">
        <article className="changed-requirement"><header><span>Alteração em</span><time>agora</time></header><strong>REQ-142</strong><h3>Autenticação de acesso</h3><p>O tempo de sessão foi revisado.</p><footer><span className="impact-mark"/> mudanças rastreadas</footer></article>
        <div className="ledger-line" aria-hidden="true" />
        <div className="impact-list" aria-label="Impactos possíveis da alteração">
          <p>Possivelmente afeta</p>
          <article><CircleDotDashed size={17}/><span><strong>REQ-087</strong><small>Permissões de workspace</small></span><ChevronRight size={16}/></article>
          <article><FileText size={17}/><span><strong>AC-04</strong><small>Critério de aceite</small></span><ChevronRight size={16}/></article>
          <article><ShieldCheck size={17}/><span><strong>Documento de segurança</strong><small>Política de sessão</small></span><ChevronRight size={16}/></article>
        </div>
      </div>
    </section>

    <section className="landing-section propagation" aria-labelledby="propagation-title">
      <div className="propagation-art" aria-hidden="true"><div className="trace trace-main"/><div className="trace trace-left"/><div className="trace trace-right"/><span className="trace-origin">REQ-142</span><span className="trace-node trace-a">Critério</span><span className="trace-node trace-b">Documento</span><span className="trace-node trace-c">Regra</span></div>
      <div className="propagation-copy"><p className="landing-overline">O mapa não é um enfeite</p><h2 id="propagation-title">Relações deixam de ser memória de equipe.</h2><p>Visualize dependências entre requisitos, documentação e decisões para investigar o alcance real de uma alteração.</p><ul><li><Check size={16}/> Navegue a partir de uma User Story</li><li><Check size={16}/> Consulte versões e relações no mesmo contexto</li><li><Check size={16}/> Mantenha a revisão ancorada em evidências</li></ul></div>
    </section>

    <section id="revisao" className="landing-section review-section" aria-labelledby="review-title">
      <div className="section-intro"><p className="landing-overline">Assistência, não piloto automático</p><h2 id="review-title">A sugestão chega com motivo.<br />A decisão continua humana.</h2></div>
      <div className="review-demo"><header><span>Possível impacto</span><small>aguardando revisão</small></header><div className="review-relationship"><span>REQ-142</span><i>→</i><span>REQ-087</span></div><p>O requisito depende da mesma regra de expiração de sessão.</p><dl><div><dt>Confiança</dt><dd>Revisar</dd></div><div><dt>Evidência</dt><dd>Regra compartilhada</dd></div></dl><footer><button type="button">Rejeitar</button><button type="button">Corrigir</button><button type="button" className="review-accept">Aceitar <ArrowRight size={15}/></button></footer></div>
    </section>

    <section className="landing-section integration-section" aria-labelledby="integration-title"><div><p className="landing-overline">Documentos no fluxo certo</p><h2 id="integration-title">O contexto não precisa ficar preso em uma ferramenta.</h2></div><article><div className="drive-symbol">D</div><div><strong>Google Drive</strong><p>Conecte uma pasta do projeto e mantenha os documentos relacionados ao trabalho de requisitos.</p></div><GitPullRequest size={22} aria-hidden="true"/></article></section>

    <section className="landing-closing" aria-labelledby="closing-title"><p className="landing-overline">Comece pelo que já mudou</p><h2 id="closing-title">Dê contexto à próxima decisão.</h2><button type="button" className="landing-primary" onClick={() => navigate("/cadastro")}>Criar conta <ArrowRight size={17}/></button></section>
    <footer className="landing-footer"><Brand compact/><span>ATHENA · engenharia de requisitos</span><button type="button" onClick={() => navigate("/login")}>Entrar</button></footer>
  </main>;
}
