import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, ListTodo, Search, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { AcceptanceCriterion } from '../../lib/types';

type Target = { id: string; resourceKind: string; externalId: string; externalName: string; settings?: Record<string, unknown>; connection: { kind: 'GITHUB'|'OPENPROJECT'; accountLabel?: string|null } };
type Link = { id: string; remoteType: string; remoteId: string; url: string; title: string; remoteStatus?: string|null; remoteMetadata?: Record<string,unknown>|null; connection: { kind: string } };
type Issue = { number: number; title: string; state: string; url: string };
type Op = { id: number; subject: string; status?: string; url: string };
type OpField = { key: string; name: string; type?: string; required?: boolean; hasDefault?: boolean; allowedValues?: Array<{ id?: string|number; name?: string; href?: string }> };

function textFromDoc(value: unknown): string {
  if (!value || typeof value !== 'object') return typeof value === 'string' ? value : '';
  const node = value as { type?: unknown; text?: unknown; content?: unknown };
  if (typeof node.text === 'string') return node.text;
  return Array.isArray(node.content) ? node.content.map(textFromDoc).filter(Boolean).join(node.type === 'paragraph' || node.type === 'heading' ? '\n' : ' ') : '';
}
function descriptionWithSource(text: string, code: string, revision: number, sourceUrl: string) {
  const marker = `Origem: ${code} (revisão ${revision})`;
  const markerIndex = text.lastIndexOf(marker);
  const content = (markerIndex >= 0 ? text.slice(0, markerIndex) : text).trimEnd();
  return `${content}\n\n${marker}\n${sourceUrl}`;
}
export function newIdempotencyKey() { return globalThis.crypto?.randomUUID?.() ?? `task-${Date.now()}-${Math.random().toString(36).slice(2)}`; }

export function ExternalTasksDialog({ projectId, requirementId, code, revision, title: initialTitle, content, criteria, editable, onClose, onSaveDraft, idempotencyKey: sharedKey, onIdempotencyKeyChange }: { projectId: string; requirementId: string; code: string; revision: number; title: string; content: unknown; criteria: AcceptanceCriterion[]; editable: boolean; onClose: () => void; onSaveDraft: () => Promise<void>; idempotencyKey?: string; onIdempotencyKeyChange?: (key:string)=>void }) {
  const client = useQueryClient();
  const targets = useQuery<Target[]>({ queryKey: ['integration-targets', projectId], queryFn: () => api(`/projects/${projectId}/integration-targets`) });
  const linked = useQuery<Link[]>({ queryKey: ['external-links', requirementId], queryFn: () => api(`/requirements/${requirementId}/external-links`) });
  const appConfig = useQuery<{ publicAppOrigin: string }>({ queryKey: ['app-config'], queryFn: () => api('/app-config') });
  const sourceUrl = appConfig.data?.publicAppOrigin
    ? new URL(`/projects/${projectId}/requirements/${requirementId}/edit`, appConfig.data.publicAppOrigin).toString()
    : import.meta.env.PROD ? '' : new URL(`/projects/${projectId}/requirements/${requirementId}/edit`, window.location.origin).toString();
  const [mode, setMode] = useState<'create'|'link'>('create');
  const [targetId, setTargetId] = useState('');
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(`${textFromDoc(content)}\n\n${criteria.length ? `Critérios de aceite\n${criteria.map((item, i) => `${i + 1}. ${[item.title, item.given && `Dado ${item.given}`, item.whenText && `Quando ${item.whenText}`, (item.thenText || item.text) && `Então ${item.thenText || item.text}`].filter(Boolean).join(' — ')}`).join('\n')}` : ''}\n\nOrigem: ${code} (revisão ${revision})\n${window.location.href}`);
  const generatedSourceUrl = useRef(window.location.href);
  useEffect(() => {
    if (!sourceUrl) return;
    const previousSourceUrl = generatedSourceUrl.current;
    setDescription(current => current.endsWith(previousSourceUrl)
      ? `${current.slice(0, -previousSourceUrl.length)}${sourceUrl}`
      : current);
    generatedSourceUrl.current = sourceUrl;
  }, [sourceUrl]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  const [typeId, setTypeId] = useState('');
  const [opFields, setOpFields] = useState<Record<string,string>>({});
  const [projectMappingId, setProjectMappingId] = useState('');
  const [fieldId, setFieldId] = useState('');
  const [optionId, setOptionId] = useState('');
  const [localIdempotencyKey, setLocalIdempotencyKey] = useState(newIdempotencyKey);
  const idempotencyKey = sharedKey ?? localIdempotencyKey;
  const rotateIdempotencyKey = () => { const next = newIdempotencyKey(); onIdempotencyKeyChange?.(next); setLocalIdempotencyKey(next); };
  const target = targets.data?.find(item => item.id === targetId);
  const opTargetProjectId = target?.connection.kind === 'OPENPROJECT' ? Number(target.externalId) : 0;
  const types = useQuery<Array<{id:number;name:string}>>({ queryKey:['op-types',projectId,opTargetProjectId], enabled:Boolean(opTargetProjectId), queryFn:()=>api(`/projects/${projectId}/integrations/openproject/types?projectId=${opTargetProjectId}`) });
  const form = useQuery<{fields:OpField[];payload:Record<string,unknown>}>({ queryKey:['op-form',projectId,opTargetProjectId,typeId], enabled:Boolean(opTargetProjectId && typeId), queryFn:()=>api(`/projects/${projectId}/integrations/openproject/form`,{method:'POST',body:JSON.stringify({projectId:opTargetProjectId,typeId:Number(typeId)})}) });
  const queryKey = target?.connection.kind === 'GITHUB' ? ['github-issues',projectId,targetId,search] : ['op-work-packages',projectId,targetId,search];
  const found = useQuery<Array<Issue|Op>>({ queryKey, enabled:mode==='link'&&Boolean(targetId)&&search.trim().length>=2, queryFn:()=>api(target!.connection.kind==='GITHUB'?`/projects/${projectId}/integrations/github/issues?mappingId=${targetId}&q=${encodeURIComponent(search)}`:`/projects/${projectId}/integrations/openproject/work-packages?mappingId=${targetId}&q=${encodeURIComponent(search)}`) });
  const create = useMutation({ mutationFn: async () => { await onSaveDraft(); const values:Record<string,unknown>={}; const links:Record<string,unknown>={}; for(const field of form.data?.fields??[]){ const value=opFields[field.key]; if(!value) continue; if(field.allowedValues?.length){ const selectedValue=field.allowedValues.find(row=>String(row.id??row.href)===value); if(selectedValue?.href) links[field.key]={href:selectedValue.href}; else values[field.key]=value; } else values[field.key]=value; } return api<Link>(`/requirements/${requirementId}/external-links`,{method:'POST',headers:{'Idempotency-Key':idempotencyKey},body:JSON.stringify({provider:target!.connection.kind,mappingId:targetId,title:title.trim(),description:descriptionWithSource(description,code,revision,sourceUrl),providerFields:target!.connection.kind==='GITHUB'?{projectMappingId:projectMappingId||undefined,fieldId:fieldId||undefined,optionId:optionId||undefined}:{values,links}})}); }, onSuccess:()=>{rotateIdempotencyKey();client.invalidateQueries({queryKey:['external-links',requirementId]});client.invalidateQueries({queryKey:['requirement',requirementId]});}, onError:(error)=>{if(error instanceof ApiError&&error.status&&error.status<500&&error.status!==409)rotateIdempotencyKey();} });
  const link = useMutation({ mutationFn:async()=>{await onSaveDraft();return api<Link>(`/requirements/${requirementId}/external-links/link`,{method:'POST',body:JSON.stringify({provider:target!.connection.kind,mappingId:targetId,remoteId:selected})});},onSuccess:()=>{client.invalidateQueries({queryKey:['external-links',requirementId]});client.invalidateQueries({queryKey:['requirement',requirementId]});} });
  const repairProject = useMutation({ mutationFn:({linkId,projectMappingId}:{linkId:string;projectMappingId:string})=>api(`/requirements/${requirementId}/external-links/${linkId}/github-project`,{method:'POST',body:JSON.stringify({projectMappingId})}),onSuccess:()=>client.invalidateQueries({queryKey:['external-links',requirementId]}) });
  const projects = targets.data?.filter(item=>item.resourceKind==='GITHUB_PROJECT')??[];
  const selectedProject = projects.find(item=>item.id===projectMappingId);
  const fields = (selectedProject?.settings as any)?.fields as Array<{id:string;name:string;options?:Array<{id:string;name:string}>}>|undefined;
  const statusField=fields?.find(item=>item.id===fieldId);
  const chosen = (found.data??[]).find(item=>String('number' in item?item.number:item.id)===selected);
  const pending=create.isPending||link.isPending;
  return <div className="modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!pending)onClose();}}><section className="modal-card external-task-modal" role="dialog" aria-modal="true" aria-labelledby="external-task-title">
    <header className="external-task-heading"><div><p className="section-kicker">{code} · Integração</p><h2 id="external-task-title">Tarefas</h2><p>Crie uma tarefa ou vincule um item existente à US.</p></div><button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}><X size={18}/></button></header>
    {linked.data?.length ? <section className="external-task-links"><h3>Vinculadas <span className="document-count">{linked.data.length}</span></h3>{linked.data.map(item=><div className="external-task-link-row" key={item.id}><a href={item.url} target="_blank" rel="noreferrer"><span>{item.connection.kind==='GITHUB'?'GitHub':'OpenProject'}</span><strong>{item.title}</strong><small>{item.remoteType.replaceAll('_',' ')} #{item.remoteId} · {item.remoteStatus??'status indisponível'}</small><ExternalLink size={15}/></a>{editable&&item.connection.kind==='GITHUB'&&Boolean(item.remoteMetadata?.projectFailure)&&<div className="external-task-repair"><p role="alert">Issue criada, mas a inclusão no GitHub Project falhou: {String(item.remoteMetadata?.projectFailure)}</p><select aria-label="GitHub Project para corrigir" value={projectMappingId} onChange={event=>{setProjectMappingId(event.target.value);setFieldId('');setOptionId('');}}><option value="">Selecione o Project</option>{projects.map(project=><option key={project.id} value={project.id}>{project.externalName}</option>)}</select>{selectedProject&&<><select aria-label="Campo de status da correção" value={fieldId} onChange={event=>{setFieldId(event.target.value);setOptionId('');}}><option value="">Sem status</option>{fields?.filter(field=>field.options?.length).map(field=><option key={field.id} value={field.id}>{field.name}</option>)}</select>{statusField&&<select aria-label="Status da correção" value={optionId} onChange={event=>setOptionId(event.target.value)}><option value="">Selecione status</option>{statusField.options?.map(option=><option key={option.id} value={option.id}>{option.name}</option>)}</select>}</>}<button className="secondary-button" disabled={!projectMappingId||repairProject.isPending} onClick={()=>repairProject.mutate({linkId:item.id,projectMappingId})}>{repairProject.isPending?'Corrigindo…':'Tentar inclusão sem recriar Issue'}</button></div>}</div>)}</section>:null}
    {!editable&&<p className="readonly-notice">Você pode consultar os vínculos existentes. Edição de tarefas requer perfil de Gerência, Owner ou Editor.</p>}
    {editable&&<><div className="external-task-mode"><button type="button" className={mode==='create'?'active':''} onClick={()=>setMode('create')}><ListTodo size={15}/>Criar tarefa</button><button type="button" className={mode==='link'?'active':''} onClick={()=>setMode('link')}><Search size={15}/>Vincular existente</button></div>
      <label className="external-task-label">Destino<select value={targetId} onChange={event=>{setTargetId(event.target.value);setSelected('');setOpFields({});}}><option value="">Selecione GitHub ou OpenProject</option>{targets.data?.map(row=><option key={row.id} value={row.id}>{row.connection.kind==='GITHUB'?'GitHub':'OpenProject'} · {row.externalName}</option>)}</select>{targets.isLoading&&<small>Carregando destinos autorizados…</small>}{!targets.isLoading&&!targets.data?.length&&<small>Nenhum destino autorizado. Um OWNER precisa configurar a aba Integrações.</small>}</label>
      {mode==='create'&&target&&<><label className="external-task-label">Título<input value={title} maxLength={300} onChange={event=>setTitle(event.target.value)}/></label><label className="external-task-label">Descrição<textarea rows={8} value={description} onChange={event=>setDescription(event.target.value)}/></label>
        {target.connection.kind==='OPENPROJECT'&&<><label className="external-task-label">Tipo de tarefa<select value={typeId} onChange={event=>{setTypeId(event.target.value);setOpFields({});}}><option value="">Selecione o tipo</option>{types.data?.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{form.data?.fields.filter(field=>field.key!=='subject'&&field.key!=='description'&&field.key!=='project').map(field=><label className="external-task-label" key={field.key}>{field.name}{field.required?' *':''}{field.allowedValues?.length?<select value={opFields[field.key]??''} onChange={event=>setOpFields(current=>({...current,[field.key]:event.target.value}))}><option value="">Selecione</option>{field.allowedValues.map((option,index)=><option key={String(option.id??option.href??index)} value={String(option.id??option.href)}>{option.name??option.id}</option>)}</select>:<input value={opFields[field.key]??''} required={field.required} onChange={event=>setOpFields(current=>({...current,[field.key]:event.target.value}))}/>}</label>)}</>}
        {target.connection.kind==='GITHUB'&&projects.length>0&&<><label className="external-task-label">GitHub Project (opcional)<select value={projectMappingId} onChange={event=>setProjectMappingId(event.target.value)}><option value="">Não adicionar a um Project</option>{projects.map(item=><option key={item.id} value={item.id}>{item.externalName}</option>)}</select></label>{selectedProject&&<><label className="external-task-label">Campo de status<select value={fieldId} onChange={event=>{setFieldId(event.target.value);setOptionId('');}}><option value="">Sem status</option>{fields?.filter(item=>item.options?.length).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{statusField&&<label className="external-task-label">Status<select value={optionId} onChange={event=>setOptionId(event.target.value)}><option value="">Selecione</option>{statusField.options?.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}</>}</>}
      </>}
      {mode==='link'&&target&&<><label className="external-task-label">Buscar por título<input value={search} onChange={event=>{setSearch(event.target.value);setSelected('');}} placeholder="Digite pelo menos 2 caracteres"/></label><div className="external-task-results">{found.isFetching&&<small>Buscando…</small>}{found.data?.map(item=>{const id=String('number' in item?item.number:item.id);return <button type="button" className={selected===id?'selected':''} key={id} onClick={()=>setSelected(id)}><strong>{'title' in item?item.title:item.subject}</strong><small>#{id} · {'state' in item?item.state:item.status??'status desconhecido'}</small></button>;})}{found.data?.length===0&&<small>Nenhum item encontrado.</small>}</div>{chosen&&<p className="external-task-selection">Selecionado: {'title' in chosen?chosen.title:chosen.subject}</p>}</>}
      {(create.error||link.error)&&<div className="inline-error" role="alert">{(create.error||link.error)?.message} {create.error?.message.toLowerCase().includes('project')&&<span>A Issue do GitHub pode ter sido criada; confira as tarefas vinculadas antes de reenviar.</span>}</div>}
      <footer className="external-task-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={pending}>Fechar</button>{mode==='create'?<button type="button" className="primary-button" disabled={!target||!title.trim()||pending||(import.meta.env.PROD&&!appConfig.data?.publicAppOrigin)||(target.connection.kind==='OPENPROJECT'&&!typeId)} onClick={()=>create.mutate()}>{pending?'Salvando e publicando…':'Salvar US e criar tarefa'}</button>:<button type="button" className="primary-button" disabled={!target||!selected||pending} onClick={()=>link.mutate()}>{pending?'Salvando…':'Salvar US e vincular'}</button>}</footer>
    </>}
  </section></div>;
}
