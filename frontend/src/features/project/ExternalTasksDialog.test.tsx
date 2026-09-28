// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { ExternalTasksDialog } from './ExternalTasksDialog';

vi.mock('../../lib/api', async importOriginal => ({ ...await importOriginal<typeof import('../../lib/api')>(), api: vi.fn() }));
let host:HTMLDivElement;let root:Root;let client:QueryClient;
const target={id:'mapping-1',resourceKind:'GITHUB_REPOSITORY',externalId:'acme/app',externalName:'acme/app',connection:{kind:'GITHUB' as const}};
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.mocked(api).mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});client.setQueryData(['integration-targets','p1'],[target]);client.setQueryData(['external-links','r1'],[]);});
afterEach(()=>{act(()=>root.unmount());client.clear();host.remove();vi.unstubAllGlobals();});
describe('ExternalTasksDialog',()=>{
  it('saves the US draft before publishing to the selected target',async()=>{
    const events:string[]=[];const onSaveDraft=vi.fn(async()=>{events.push('save');});
    vi.mocked(api).mockImplementation(async(path,init)=>{if(path==='/app-config')return {publicAppOrigin:'https://athena.example'} as any;if(path==='/projects/p1/integration-targets')return [target] as any;if(path==='/requirements/r1/external-links'&&init?.method==='POST'){events.push('publish');return {id:'link-1',remoteType:'GITHUB_ISSUE',remoteId:'1',url:'https://github.com/acme/app/issues/1',title:'Criar tela',connection:{kind:'GITHUB'}} as any;}if(path==='/requirements/r1/external-links')return [] as any;return [] as any;});
    await act(async()=>root.render(<QueryClientProvider client={client}><ExternalTasksDialog projectId="p1" requirementId="r1" code="US-001" revision={3} title="Criar tela" content={{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Conteúdo da US'}]}]}} criteria={[]} editable onClose={()=>{}} onSaveDraft={onSaveDraft}/></QueryClientProvider>));
    const select=host.querySelector<HTMLSelectElement>('.external-task-label select')!;
    await act(async()=>{select.value='mapping-1';select.dispatchEvent(new Event('change',{bubbles:true}));});
    await act(async()=>new Promise(resolve=>setTimeout(resolve,20)));
    expect(host.querySelector<HTMLTextAreaElement>('textarea')?.value).toContain('https://athena.example/projects/p1/requirements/r1/edit');
    const publish=Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Salvar US e criar tarefa')!;
    expect(publish.disabled).toBe(false);await act(async()=>publish.click());await act(async()=>new Promise(resolve=>setTimeout(resolve,20)));
    expect(onSaveDraft).toHaveBeenCalledTimes(1);expect(events).toEqual(['save','publish']);
    expect(vi.mocked(api).mock.calls.find(([path,init])=>path==='/requirements/r1/external-links'&&init?.method==='POST')?.[1]?.headers).toHaveProperty('Idempotency-Key');
  });
});
