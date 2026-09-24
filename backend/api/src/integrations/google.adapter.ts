import { BadGatewayException, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { decodeGoogleDocument, encodeTipTapDocument } from './google-docs-codec';

export const GOOGLE_SCOPES = [
  // The linked root can contain arbitrary descendants, so drive.file is not
  // sufficient to enumerate and reconcile it. Reconnecting is intentional:
  // old readonly grants cannot silently gain write access.
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
] as const;

export const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';
export const WORD_DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const READABLE_GOOGLE_MIME_TYPES = new Set([
  GOOGLE_DOC_MIME,
  WORD_DOCX_MIME,
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
]);

export type GoogleFile = { id: string; name: string; mimeType: string; modifiedTime?: string; webViewLink?: string; parents?: string[]; ownedByMe?: boolean; sharedWithMeTime?: string };
export type GoogleTokenSet = { access_token: string; refresh_token?: string; expires_in?: number; token_type?: string };
type GoogleResponse = { ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> };
type Mammoth = { extractRawText(input: { buffer: Buffer }): Promise<{ value: string }> };

export class GoogleApiError extends Error {
  constructor(readonly code: 'AUTHENTICATION' | 'PERMISSION_REVOKED' | 'RATE_LIMIT' | 'UNSUPPORTED_FILE' | 'UPSTREAM', readonly status: number, message: string) { super(message); }
}

/** Mockable Google OAuth/Drive/Docs client. Secrets are only ever sent in headers/body to Google. */
export class GoogleAdapter {
  private readonly authUrl = process.env.GOOGLE_AUTH_URL ?? 'https://accounts.google.com/o/oauth2/v2/auth';
  private readonly tokenUrl = process.env.GOOGLE_TOKEN_URL ?? 'https://oauth2.googleapis.com/token';
  private readonly driveUrl = (process.env.GOOGLE_DRIVE_API_URL ?? 'https://www.googleapis.com/drive/v3').replace(/\/$/, '');
  private readonly docsUrl = (process.env.GOOGLE_DOCS_API_URL ?? 'https://docs.googleapis.com/v1').replace(/\/$/, '');
  constructor(private readonly request: (input: string, init?: RequestInit) => Promise<GoogleResponse> = (input, init) => fetch(input, init) as unknown as Promise<GoogleResponse>) {}

  authorizationUrl(state: string, redirectUri: string, clientId: string): string {
    const query = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', scope: GOOGLE_SCOPES.join(' '), state });
    return `${this.authUrl}?${query.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string, clientId: string, clientSecret: string): Promise<GoogleTokenSet> {
    const response = await this.request(this.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }).toString() });
    if (!response.ok) throw new GoogleApiError(response.status === 400 ? 'AUTHENTICATION' : 'UPSTREAM', response.status, 'Não foi possível concluir o OAuth do Google');
    const token = await response.json() as any;
    if (typeof token.access_token !== 'string') throw new GoogleApiError('UPSTREAM', 502, 'Google não retornou um access token válido');
    return token as GoogleTokenSet;
  }

  async refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<GoogleTokenSet> {
    const response = await this.request(this.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' }).toString() });
    if (!response.ok) throw new GoogleApiError(response.status === 400 || response.status === 401 ? 'AUTHENTICATION' : 'UPSTREAM', response.status, 'Refresh token do Google expirado ou revogado');
    const token = await response.json() as any;
    if (typeof token.access_token !== 'string') throw new GoogleApiError('AUTHENTICATION', 401, 'Google não retornou um access token válido');
    return token as GoogleTokenSet;
  }

  private async get<T>(accessToken: string, url: string): Promise<T> {
    const response = await this.request(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
    if (response.ok) return await response.json() as T;
    if (response.status === 401) throw new GoogleApiError('AUTHENTICATION', 401, 'Credencial do Google inválida ou expirada');
    if (response.status === 429) throw new GoogleApiError('RATE_LIMIT', 429, 'Limite de requisições do Google atingido');
    if (response.status === 403) throw new GoogleApiError('PERMISSION_REVOKED', 403, 'Permissão do Google revogada para este arquivo');
    throw new GoogleApiError('UPSTREAM', response.status, 'Google não respondeu à solicitação');
  }

  private async mutate<T>(accessToken: string, url: string, init: RequestInit): Promise<T> {
    const response = await this.request(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', ...(init.headers ?? {}) } });
    if (response.ok) return await response.json() as T;
    if (response.status === 401) throw new GoogleApiError('AUTHENTICATION', 401, 'Credencial do Google inválida ou expirada');
    if (response.status === 429) throw new GoogleApiError('RATE_LIMIT', 429, 'Limite de requisições do Google atingido');
    if (response.status === 403) throw new GoogleApiError('PERMISSION_REVOKED', 403, 'Permissão do Google revogada para este arquivo');
    throw new GoogleApiError('UPSTREAM', response.status, 'Não foi possível atualizar o Google Drive');
  }

  async listFiles(accessToken: string, pageToken?: string): Promise<{ files: GoogleFile[]; nextPageToken?: string }> {
    const query = new URLSearchParams({ pageSize: '100', fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,parents)', q: 'trashed = false' });
    if (pageToken) query.set('pageToken', pageToken);
    return this.get(accessToken, `${this.driveUrl}/files?${query.toString()}`);
  }

  async listFolders(accessToken: string, pageToken?: string, search?: string) {
    const escapedSearch = search?.trim().replace(/'/g, "\\'");
    const terms = ["mimeType = 'application/vnd.google-apps.folder'", 'trashed = false'];
    if (escapedSearch) terms.push(`name contains '${escapedSearch}'`);
    const query = new URLSearchParams({ pageSize: '12', orderBy: 'modifiedTime desc', fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,parents,ownedByMe,sharedWithMeTime)', q: terms.join(' and '), corpora: 'user', includeItemsFromAllDrives: 'true', supportsAllDrives: 'true' });
    if (pageToken) query.set('pageToken', pageToken);
    return this.get<{ files: GoogleFile[]; nextPageToken?: string }>(accessToken, `${this.driveUrl}/files?${query.toString()}`);
  }

  async listFolderFiles(accessToken: string, folderId: string, pageToken?: string) {
    const query = new URLSearchParams({ pageSize: '100', fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,parents)', q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`, includeItemsFromAllDrives: 'true', supportsAllDrives: 'true' });
    if (pageToken) query.set('pageToken', pageToken);
    return this.get<{ files: GoogleFile[]; nextPageToken?: string }>(accessToken, `${this.driveUrl}/files?${query.toString()}`);
  }

  async readFile(accessToken: string, file: GoogleFile): Promise<{ title: string; content: string; mimeType: string; document?: Record<string, unknown> }> {
    if (file.mimeType === GOOGLE_DOC_MIME) {
      const doc = await this.get<any>(accessToken, `${this.docsUrl}/documents/${encodeURIComponent(file.id)}`);
      const content = (doc.body?.content ?? []).flatMap((block: any) => block.paragraph?.elements ?? []).map((el: any) => el.textRun?.content ?? '').join('');
      return { title: file.name, content, mimeType: file.mimeType, document: decodeGoogleDocument(doc) };
    }
    if (!READABLE_GOOGLE_MIME_TYPES.has(file.mimeType)) throw new GoogleApiError('UNSUPPORTED_FILE', 415, `Arquivo Google não suportado: ${file.mimeType}`);
    const response = await this.request(`${this.driveUrl}/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.ok) {
      if (file.mimeType === WORD_DOCX_MIME) {
        // Mammoth reads the OOXML package locally. The document never leaves
        // the API process and only its text becomes the canonical US content.
        const mammoth = require('mammoth') as Mammoth;
        const result = await mammoth.extractRawText({ buffer: Buffer.from(await response.arrayBuffer()) });
        return { title: file.name, content: result.value.trim(), mimeType: file.mimeType };
      }
      return { title: file.name, content: await response.text(), mimeType: file.mimeType };
    }
    if (response.status === 401) throw new GoogleApiError('AUTHENTICATION', 401, 'Credencial do Google inválida ou expirada');
    if (response.status === 429) throw new GoogleApiError('RATE_LIMIT', 429, 'Limite de requisições do Google atingido');
    if (response.status === 403) throw new GoogleApiError('PERMISSION_REVOKED', 403, 'Permissão do Google revogada para este arquivo');
    throw new GoogleApiError('UPSTREAM', response.status, 'Não foi possível ler o arquivo no Google Drive');
  }

  async createDocument(accessToken: string, title: string) {
    return this.mutate<{ documentId: string; title: string }>(accessToken, `${this.docsUrl}/documents`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) });
  }

  async replaceDocumentText(accessToken: string, documentId: string, text: string) {
    const document = await this.get<any>(accessToken, `${this.docsUrl}/documents/${encodeURIComponent(documentId)}`);
    const endIndex = Math.max(1, Number(document.body?.content?.at?.(-1)?.endIndex ?? 1) - 1);
    const requests: any[] = [];
    if (endIndex > 1) requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex } } });
    if (text) requests.push({ insertText: { location: { index: 1 }, text } });
    if (requests.length) await this.mutate(accessToken, `${this.docsUrl}/documents/${encodeURIComponent(documentId)}:batchUpdate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requests }) });
  }

  async replaceDocument(accessToken: string, documentId: string, content: unknown) {
    const encoded = encodeTipTapDocument(content);
    const document = await this.get<any>(accessToken, `${this.docsUrl}/documents/${encodeURIComponent(documentId)}`);
    const endIndex = Math.max(1, Number(document.body?.content?.at?.(-1)?.endIndex ?? 1) - 1);
    const requests: any[] = [];
    if (endIndex > 1) requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex } } });
    if (encoded.text) requests.push({ insertText: { location: { index: 1 }, text: encoded.text } });
    requests.push(...encoded.requests);
    if (requests.length) await this.mutate(accessToken, `${this.docsUrl}/documents/${encodeURIComponent(documentId)}:batchUpdate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requests }) });
  }

  async updateFileName(accessToken: string, fileId: string, name: string) {
    return this.mutate<GoogleFile>(accessToken, `${this.driveUrl}/files/${encodeURIComponent(fileId)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
  }

  async updateTextFile(accessToken: string, fileId: string, text: string) {
    const response = await this.request(`${this.driveUrl}/files/${encodeURIComponent(fileId)}?uploadType=media`, { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'text/plain' }, body: text });
    if (response.ok) return;
    if (response.status === 401) throw new GoogleApiError('AUTHENTICATION', 401, 'Credencial do Google inválida ou expirada');
    if (response.status === 429) throw new GoogleApiError('RATE_LIMIT', 429, 'Limite de requisições do Google atingido');
    if (response.status === 403) throw new GoogleApiError('PERMISSION_REVOKED', 403, 'Permissão do Google revogada para este arquivo');
    throw new GoogleApiError('UPSTREAM', response.status, 'Não foi possível atualizar o arquivo no Google Drive');
  }

  async moveFile(accessToken: string, fileId: string, destinationId: string, currentParents: string[] = []) {
    const query = new URLSearchParams({ addParents: destinationId, fields: 'id,name,mimeType,modifiedTime,parents' });
    const removable = currentParents.filter(parent => parent !== destinationId);
    if (removable.length) query.set('removeParents', removable.join(','));
    return this.mutate<GoogleFile>(accessToken, `${this.driveUrl}/files/${encodeURIComponent(fileId)}?${query.toString()}`, { method: 'PATCH' });
  }

  async createFolder(accessToken: string, name: string, parentId: string) {
    return this.mutate<GoogleFile>(accessToken, `${this.driveUrl}/files`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }) });
  }
}

export function mapGoogleError(error: unknown): never {
  if (!(error instanceof GoogleApiError)) throw new BadGatewayException('Falha ao consultar o Google');
  if (error.code === 'AUTHENTICATION') throw new UnauthorizedException(error.message);
  if (error.code === 'PERMISSION_REVOKED') throw new HttpException(error.message, HttpStatus.FORBIDDEN);
  if (error.code === 'RATE_LIMIT') throw new HttpException(error.message, HttpStatus.TOO_MANY_REQUESTS);
  if (error.code === 'UNSUPPORTED_FILE') throw new HttpException(error.message, HttpStatus.UNSUPPORTED_MEDIA_TYPE);
  throw new BadGatewayException(error.message);
}
