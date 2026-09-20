import { Icon } from '../Icon';

export function ContentState({ loading = false, title, message, retry }: { loading?: boolean; title: string; message?: string; retry?: () => void }) {
  return <div className="content-state" role={message ? 'alert' : undefined} aria-live={loading ? 'polite' : undefined}>
    {loading ? <span className="loading-ring" aria-hidden="true"/> : <span className="state-symbol" aria-hidden="true">!</span>}
    <strong>{title}</strong>{message && <span>{message}</span>}
    {retry && <button className="secondary-button" onClick={retry}><Icon name="refresh" size={13}/> Tentar novamente</button>}
  </div>;
}
