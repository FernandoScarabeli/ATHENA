import { GoogleAdapter, GoogleApiError, GOOGLE_SCOPES } from '../src/integrations/google.adapter';

jest.mock('mammoth', () => ({ extractRawText: jest.fn() }));
const mammoth = require('mammoth') as { extractRawText: jest.Mock };

function response(body: unknown, status = 200, text = '', bytes = new Uint8Array()): any { return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => text, arrayBuffer: async () => bytes.buffer }; }

describe('GoogleAdapter', () => {
  it('builds minimal-scope authorization URL without credentials', () => {
    const adapter = new GoogleAdapter(jest.fn()); const url = new URL(adapter.authorizationUrl('state-value', 'http://localhost/callback', 'client-id'));
    expect(url.searchParams.get('state')).toBe('state-value'); expect(url.searchParams.get('scope')).toBe(GOOGLE_SCOPES.join(' ')); expect(url.searchParams.get('client_secret')).toBeNull();
  });
  it('exchanges code and reads Docs text', async () => {
    const request = jest.fn().mockResolvedValueOnce(response({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 })).mockResolvedValueOnce(response({ body: { content: [{ paragraph: { elements: [{ textRun: { content: 'Hello\n' } }] } }] } }));
    const adapter = new GoogleAdapter(request); await expect(adapter.exchangeCode('code', 'http://callback', 'id', 'secret')).resolves.toMatchObject({ access_token: 'access' });
    await expect(adapter.readFile('access', { id: 'doc', name: 'Doc', mimeType: 'application/vnd.google-apps.document' })).resolves.toMatchObject({ content: 'Hello\n' });
    expect(request.mock.calls[0][1].body).not.toContain('access');
  });
  it('reports unsupported file and permission errors clearly', async () => {
    const adapter = new GoogleAdapter(jest.fn()); await expect(adapter.readFile('access', { id: 'zip', name: 'Zip', mimeType: 'application/zip' })).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE' });
    const denied = new GoogleAdapter(jest.fn().mockResolvedValue(response({}, 403))); await expect(denied.listFiles('access')).rejects.toBeInstanceOf(GoogleApiError);
  });
  it('extracts text from a Word DOCX download', async () => {
    mammoth.extractRawText.mockResolvedValueOnce({ value: 'História importada\n' });
    const adapter = new GoogleAdapter(jest.fn().mockResolvedValue(response({}, 200, '', new Uint8Array([80, 75]))));
    await expect(adapter.readFile('access', { id: 'word', name: 'História.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })).resolves.toMatchObject({ content: 'História importada', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    expect(mammoth.extractRawText).toHaveBeenCalledWith({ buffer: expect.any(Buffer) });
  });
  it('distinguishes provider rate limit from revoked permission', async () => {
    const limited = new GoogleAdapter(jest.fn().mockResolvedValue(response({}, 429)));
    await expect(limited.listFiles('access')).rejects.toMatchObject({ code: 'RATE_LIMIT', status: 429 });
    const denied = new GoogleAdapter(jest.fn().mockResolvedValue(response({}, 403)));
    await expect(denied.listFiles('access')).rejects.toMatchObject({ code: 'PERMISSION_REVOKED', status: 403 });
  });
  it('requests ownership metadata when listing folders', async () => {
    const request = jest.fn().mockResolvedValue(response({ files: [] }));
    const adapter = new GoogleAdapter(request);
    await adapter.listFolders('access');
    const url = new URL(request.mock.calls[0][0]);
    expect(url.searchParams.get('fields')).toContain('ownedByMe');
    expect(url.searchParams.get('fields')).toContain('sharedWithMeTime');
    expect(url.searchParams.get('includeItemsFromAllDrives')).toBe('true');
    expect(url.searchParams.get('supportsAllDrives')).toBe('true');
  });
});
