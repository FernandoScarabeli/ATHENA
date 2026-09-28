import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { AccessRequest, AccessScope, ProjectRole, WorkspaceRole } from '../../lib/types';

type Invite = { id: string; email: string; role: ProjectRole; expiresAt: string; acceptedAt?: string | null; revokedAt?: string | null; deliveryError?: string | null };
type Member = { scope: 'WORKSPACE' | 'PROJECT'; role: ProjectRole | WorkspaceRole; user: { id: string; name: string; email: string } };

export function AccessRequestInbox({ workspaceId, projectId, compact = false, projectOnly = false }: { workspaceId?: string; projectId?: string; compact?: boolean; projectOnly?: boolean }) {
  const client = useQueryClient();
  const queryKey = workspaceId ? ['access-requests', 'workspace', workspaceId] : ['access-requests', 'project', projectId];
  const endpoint = workspaceId ? `/workspaces/${workspaceId}/access-requests` : `/projects/${projectId}/access-requests`;
  const requests = useQuery<AccessRequest[]>({ queryKey, queryFn: () => api(endpoint), enabled: Boolean(workspaceId || projectId) });
  const requestRows = Array.isArray(requests.data) ? requests.data : [];
  const decide = useMutation({
    mutationFn: ({ id, approve, scope, role }: { id: string; approve: boolean; scope?: AccessScope; role?: ProjectRole }) => api<AccessRequest>(`/access-requests/${id}/${approve ? 'approve' : 'deny'}`, { method: 'POST', ...(approve ? { body: JSON.stringify({ scope, role }) } : {}) }),
    onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey }), client.invalidateQueries({ queryKey: ['workspaces'] }), client.invalidateQueries({ queryKey: ['notifications'] })]); },
  });
  return <section className={`access-inbox${compact ? ' is-compact' : ''}`} aria-labelledby={`access-inbox-title-${workspaceId ?? projectId}`}>
    <header><div><h3 id={`access-inbox-title-${workspaceId ?? projectId}`}>Pedidos de acesso</h3><p>Links compartilhados podem gerar pedidos pendentes.</p></div><span>{requestRows.filter(item => item.status === 'PENDING').length}</span></header>
    {requests.isLoading && <p className="empty-copy">Carregando pedidos…</p>}
    {requests.isError && <div className="inline-error" role="alert">Não foi possível carregar os pedidos: {requests.error.message}<button type="button" className="text-button" onClick={() => requests.refetch()}>Tentar novamente</button></div>}
    {!requests.isLoading && !requests.isError && !requestRows.length && <p className="empty-copy">Nenhum pedido de acesso.</p>}
    <div className="access-request-list">{requestRows.map(request => <AccessRequestCard key={request.id} request={request} busy={decide.isPending} projectOnly={projectOnly} onDecide={(approve, scope, role) => decide.mutate({ id: request.id, approve, scope, role })}/>)}</div>
    {decide.error && <div className="inline-error" role="alert">{decide.error.message}</div>}
  </section>;
}

function AccessRequestCard({ request, busy, projectOnly, onDecide }: { request: AccessRequest; busy: boolean; projectOnly: boolean; onDecide: (approve: boolean, scope?: AccessScope, role?: ProjectRole) => void }) {
  const [scope, setScope] = useState<AccessScope>('PROJECT');
  const [role, setRole] = useState<ProjectRole>('VIEWER');
  const pending = request.status === 'PENDING';
  return <article className="access-request-card-row">
    <div className="access-request-person"><strong>{request.requester?.name ?? 'Pessoa solicitante'}</strong><small>{request.requester?.email} · {request.project?.name ?? 'Projeto'}</small></div>
    {pending ? <div className="access-request-controls">
      {projectOnly ? <span className="access-request-project-scope">Acesso somente a este projeto</span> : <label>Conceder<select className="role-select" value={scope} onChange={event => setScope(event.target.value as AccessScope)}><option value="PROJECT">Somente este projeto</option><option value="WORKSPACE">Workspace inteiro</option></select></label>}
      <label>Papel<select className="role-select" value={role} onChange={event => setRole(event.target.value as ProjectRole)}><option value="VIEWER">Viewer</option><option value="EDITOR">Editor</option></select></label>
      <div className="access-request-actions"><button type="button" className="primary-button" disabled={busy} onClick={() => onDecide(true, scope, role)}>Aprovar</button><button type="button" className="text-button" disabled={busy} onClick={() => onDecide(false)}>Recusar</button></div>
    </div> : <span className={`access-request-status ${request.status.toLowerCase()}`}>{request.status === 'APPROVED' ? `Aprovado · ${request.scope === 'WORKSPACE' ? 'Workspace · ' : ''}${request.role === 'EDITOR' ? 'Editor' : 'Viewer'}` : 'Recusado'} · {request.decidedAt ? new Date(request.decidedAt).toLocaleDateString('pt-BR') : ''}</span>}
  </article>;
}

export function ProjectAccessPanel({ projectId, managerMode = false }: { projectId: string; managerMode?: boolean }) {
  const client = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ProjectRole>('VIEWER');
  const members = useQuery<Member[]>({ queryKey: ['project-members', projectId], queryFn: () => api(`/projects/${projectId}/members`) });
  const invites = useQuery<Invite[]>({ queryKey: ['project-invites', projectId], queryFn: () => api(`/projects/${projectId}/invites`) });
  const memberRows = Array.isArray(members.data) ? members.data : [];
  const inviteRows = Array.isArray(invites.data) ? invites.data : [];
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: ['project-members', projectId] }), client.invalidateQueries({ queryKey: ['project-invites', projectId] }), client.invalidateQueries({ queryKey: ['access-requests', 'project', projectId] })]);
  const invite = useMutation({ mutationFn: () => api(`/projects/${projectId}/invites`, { method: 'POST', body: JSON.stringify({ email: email.trim(), role }) }), onSuccess: async () => { setEmail(''); await refresh(); } });
  const revokeInvite = useMutation({ mutationFn: (id: string) => api(`/projects/${projectId}/invites/${id}`, { method: 'DELETE' }), onSuccess: refresh });
  const resendInvite = useMutation({ mutationFn: (id: string) => api(`/projects/${projectId}/invites/${id}/resend`, { method: 'POST' }), onSuccess: refresh });
  const updateMember = useMutation({ mutationFn: ({ userId, role: nextRole }: { userId: string; role: ProjectRole }) => api(`/projects/${projectId}/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ role: nextRole }) }), onSuccess: refresh });
  const removeMember = useMutation({ mutationFn: (userId: string) => api(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' }), onSuccess: refresh });
  return <div className="project-access-panel">
    <section className="project-access-section">
      <div className="settings-panel-heading"><div><h3>Membros do projeto</h3><p>Acesso herdado do workspace aparece como Workspace.</p></div><span>{memberRows.length}</span></div>
      {members.isLoading && <p className="empty-copy">Carregando membros…</p>}
      {members.isError && <div className="inline-error" role="alert">{members.error.message}<button type="button" className="text-button" onClick={() => members.refetch()}>Tentar novamente</button></div>}
      <div className="members-list">{memberRows.map(member => <div className="member-row" key={`${member.scope}:${member.user.id}`}><span className="avatar">{member.user.name.slice(0, 1).toUpperCase()}</span><div><strong>{member.user.name}</strong><small>{member.user.email} · {member.scope === 'WORKSPACE' ? 'Workspace' : 'Projeto'}</small></div>{member.scope === 'PROJECT' ? <><select className="role-select" aria-label={`Papel de ${member.user.name}`} value={member.role} onChange={event => updateMember.mutate({ userId: member.user.id, role: event.target.value as ProjectRole })}><option value="EDITOR">Editor</option><option value="VIEWER">Viewer</option></select><button type="button" className="text-button" onClick={() => removeMember.mutate(member.user.id)}>Remover</button></> : <span className="member-owner">{member.role === 'OWNER' ? 'Owner' : member.role === 'MANAGER' ? 'Gerência' : member.role === 'EDITOR' ? 'Editor' : 'Viewer'}</span>}</div>)}</div>
    </section>
    <section className="project-access-section">
      <div className="settings-panel-heading"><div><h3>Convidar por e-mail</h3><p>O link libera o acesso depois da confirmação do e-mail e do aceite.</p></div></div>
      <form className="member-invite" onSubmit={event => { event.preventDefault(); if (email.trim()) invite.mutate(); }}><input type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="pessoa@empresa.com" aria-label="E-mail da pessoa convidada"/><select className="role-select" value={role} onChange={event => setRole(event.target.value as ProjectRole)} aria-label="Papel no projeto"><option value="EDITOR">Editor</option><option value="VIEWER">Viewer</option></select><button type="submit" className="primary-button" disabled={!email.trim() || invite.isPending}>{invite.isPending ? 'Enviando…' : 'Convidar'}</button></form>
      {invite.error && <div className="inline-error" role="alert">{invite.error.message}</div>}
      {invites.isError && <div className="inline-error" role="alert">Não foi possível carregar os convites: {invites.error.message}</div>}
      {inviteRows.filter(item => !item.acceptedAt && !item.revokedAt).map(item => <div className="invite-row" key={item.id}><span><strong>{item.email}</strong><small>{item.role === 'EDITOR' ? 'Editor' : 'Viewer'} · expira em {new Date(item.expiresAt).toLocaleDateString('pt-BR')}</small>{item.deliveryError && <em role="alert">{item.deliveryError}</em>}</span><button type="button" className="text-button" disabled={resendInvite.isPending} onClick={() => resendInvite.mutate(item.id)}>Reenviar</button><button type="button" className="text-button" disabled={revokeInvite.isPending} onClick={() => revokeInvite.mutate(item.id)}>Revogar</button></div>)}
    </section>
    <AccessRequestInbox projectId={projectId} projectOnly={managerMode}/>
  </div>;
}
