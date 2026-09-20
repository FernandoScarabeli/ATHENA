const labels = { DRAFT: 'Rascunho', ACTIVE: 'Ativa', ARCHIVED: 'Arquivada' } as const;

export function StatusBadge({ status }: { status: keyof typeof labels }) {
  return <span className={`status-pill status-${status.toLowerCase()}`}>{labels[status]}</span>;
}
