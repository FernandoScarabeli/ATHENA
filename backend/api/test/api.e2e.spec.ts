import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/core/prisma.service';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { HttpErrorFilter } from '../src/common/http-error.filter';

// This suite is deliberately opt-in. The name guard prevents accidental use of
// the developer/demo database, while still exercising the real Nest HTTP stack.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const safeDatabase = Boolean(testDatabaseUrl && /(?:^|\/)(athena_test|athena_test_[^/?]+)(?:\?|$)/.test(testDatabaseUrl));
const describeE2e = safeDatabase ? describe : describe.skip;
if (testDatabaseUrl && !safeDatabase) throw new Error('TEST_DATABASE_URL deve apontar explicitamente para um banco athena_test ou athena_test_*');
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;

type Json = Record<string, any> | any[];
class HttpClient {
  private cookies = new Map<string, string>();
  constructor(readonly base: string) {}
  async request(method: string, path: string, body?: Json) {
    const response = await fetch(`${this.base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(this.cookieHeader() ? { cookie: this.cookieHeader() } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const getSetCookie = (response.headers as any).getSetCookie;
    const setCookies: string[] = typeof getSetCookie === 'function'
      ? getSetCookie.call(response.headers)
      : (response.headers.get('set-cookie') ?? '').split(/,(?=[^;,]+=)/g).filter(Boolean);
    for (const value of setCookies) {
      const [pair] = value.split(';'); const separator = pair.indexOf('=');
      if (separator > 0) this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : undefined };
  }
  private cookieHeader() { return [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '); }
}

describeE2e('ATH-011 authenticated HTTP E2E', () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  let prisma: PrismaService;
  const users: Record<string, string> = {};
  const emails: Record<string, string> = {};
  const clients: Record<string, HttpClient> = {};
  let workspaceId = ''; let projectId = ''; let folderId = ''; let requirementId = '';
  let secondRequirementId = ''; let templateId = ''; let relationId = '';
  let apiBase = '';

  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'texto persistido' }] }] };
  const call = (client: HttpClient, method: string, path: string, body?: Json) => client.request(method, path, body);

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api'); app.use(helmet()); app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
    const server = app.getHttpServer();
    await new Promise<void>(resolve => server.listen(0, resolve));
    const address = server.address();
    const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`; apiBase = base;
    for (const [role, name] of [['owner', 'Owner'], ['editor', 'Editor'], ['viewer', 'Viewer'], ['external', 'External']]) {
      const email = `ath011-${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
      const client = new HttpClient(base); clients[role] = client;
      const registered = await call(client, 'POST', '/api/auth/register', { email, name, password: 'Senha-e2e-123' });
      expect(registered.status).toBe(201); users[role] = registered.body.id; emails[role] = email;
    }
  });

  afterAll(async () => {
    const ids = Object.values(users);
    if (prisma) {
      if (ids.length) await prisma.activityLog.deleteMany({ where: { userId: { in: ids } } });
      if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } });
      if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    if (app) await app.close();
  });

  it('runs registration, cookies, workspace/project, template, folders and requirement persistence', async () => {
    prisma = app.get(PrismaService);
    const owner = clients.owner;
    expect((await call(owner, 'GET', '/api/auth/me')).status).toBe(200);
    expect((await call(owner, 'POST', '/api/workspaces', { name: 'ATH-011 E2E' })).status).toBe(201);
    workspaceId = (await call(owner, 'GET', '/api/workspaces')).body[0].id;
    projectId = (await call(owner, 'POST', `/api/workspaces/${workspaceId}/projects`, { name: 'Produto E2E', key: 'E2E' })).body.id;
    const folders = await call(owner, 'GET', `/api/workspaces/${workspaceId}/folders`);
    expect(folders.status).toBe(200); folderId = folders.body.find((folder: any) => folder.name === 'Sem pasta').id;
    const createdFolder = await call(owner, 'POST', `/api/workspaces/${workspaceId}/folders`, { name: 'Roadmap' });
    expect(createdFolder.status).toBe(201);
    const template = await call(owner, 'POST', `/api/workspaces/${workspaceId}/templates`, { name: 'Template E2E', content: doc, acceptanceCriteria: [{ title: 'Aceite', text: 'deve persistir', given: 'dado', when: 'quando', then: 'então' }] });
    expect(template.status).toBe(201); templateId = template.body.id;
    const created = await call(owner, 'POST', `/api/projects/${projectId}/requirements`, { title: 'US E2E', folderId, templateId, content: {} });
    expect(created.status).toBe(201); requirementId = created.body.id;
    expect(created.body.content).toEqual(doc); expect(created.body.criteria).toEqual([expect.objectContaining({ title: 'Aceite', text: 'deve persistir' })]);
    const second = await call(owner, 'POST', `/api/projects/${projectId}/requirements`, { title: 'US relação', folderId, content: doc });
    expect(second.status).toBe(201); secondRequirementId = second.body.id;
    expect((await call(owner, 'GET', `/api/projects/${projectId}/requirements`)).body).toEqual(expect.arrayContaining([expect.objectContaining({ id: requirementId })]));
  });

  it('enforces roles/isolation, saves versions, relations, references policy and archive semantics', async () => {
    const owner = clients.owner; const editor = clients.editor; const viewer = clients.viewer; const external = clients.external;
    expect((await call(owner, 'POST', `/api/workspaces/${workspaceId}/members`, { email: emails.editor, role: 'EDITOR' })).status).toBe(201);
    expect((await call(owner, 'POST', `/api/workspaces/${workspaceId}/members`, { email: emails.viewer, role: 'VIEWER' })).status).toBe(201);
    expect((await call(viewer, 'PATCH', `/api/requirements/${requirementId}`, { revision: 1, title: 'não autorizado' })).status).toBe(403);
    expect((await call(external, 'GET', `/api/requirements/${requirementId}`)).status).toBe(403);
    const saved = await call(editor, 'PATCH', `/api/requirements/${requirementId}`, { revision: 1, title: 'US salva', content: doc, acceptanceCriteria: [{ title: 'Pronto', text: 'funciona' }] });
    expect(saved.status).toBe(200); expect(saved.body.revision).toBe(2); expect(saved.body.status).toBe('ACTIVE');
    expect((await call(viewer, 'GET', `/api/requirements/${requirementId}/versions`)).body).toEqual(expect.arrayContaining([expect.objectContaining({ revision: 2 })]));
    const relation = await call(editor, 'POST', `/api/requirements/${requirementId}/relations`, { targetId: secondRequirementId, type: 'RELATED_TO' });
    expect(relation.status).toBe(201); relationId = relation.body.id;
    expect((await call(viewer, 'GET', `/api/requirements/${requirementId}/relations`)).body).toEqual(expect.arrayContaining([expect.objectContaining({ id: relationId })]));
    const reference = await call(editor, 'POST', `/api/requirements/${requirementId}/references`, { type: 'PROTOTYPE', name: 'manual', url: 'https://example.test' });
    expect(reference.status).toBe(409); expect(reference.body.error.code).toBe('MANUAL_REFERENCE_CREATION_DISABLED');
    const comment = await call(viewer, 'POST', `/api/requirements/${secondRequirementId}/comments`, { body: 'revisar este item', anchor: { from: 0, to: 5, quote: 'revisar' }, mentionedUserIds: [users.editor] });
    expect(comment.status).toBe(201);
    expect((await call(editor, 'GET', '/api/notifications')).body).toEqual(expect.arrayContaining([expect.objectContaining({ userId: users.editor })]));
    expect((await call(viewer, 'GET', `/api/requirements/${requirementId}`)).body).toMatchObject({ title: 'US salva', revision: 2 });
    const archived = await call(editor, 'DELETE', `/api/requirements/${requirementId}`);
    expect(archived.status).toBe(200); expect(archived.body.status).toBe('ARCHIVED');
    expect((await call(viewer, 'GET', `/api/projects/${projectId}/requirements`)).body).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: requirementId })]));
    expect((await call(viewer, 'GET', `/api/projects/${projectId}/requirements?status=archived`)).body).toEqual(expect.arrayContaining([expect.objectContaining({ id: requirementId, status: 'ARCHIVED' })]));
    expect((await call(editor, 'PATCH', `/api/requirements/${requirementId}`, { revision: 2, title: 'não editar' })).status).toBe(400);
    expect((await call(new HttpClient(apiBase), 'GET', '/api/auth/me')).status).toBe(401);
  });
});
