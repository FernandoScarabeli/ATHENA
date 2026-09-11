import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Falha de renderização do ATHENA', error, info); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="state-page" role="alert"><span className="state-symbol">!</span><p className="section-kicker">Erro inesperado</p><h1>ATHENA encontrou um problema</h1><p>Recarregue a aplicação para tentar novamente.</p><button className="primary-button" onClick={() => window.location.reload()}>Recarregar</button></main>;
  }
}
