import { OpenProjectAdapter, OpenProjectApiError } from '../src/integrations/openproject.adapter';

function response(status: number, body: unknown): any { return { ok: status >= 200 && status < 300, status, headers: new Headers(), json: jest.fn().mockResolvedValue(body), text: jest.fn().mockResolvedValue(JSON.stringify(body)) }; }
const credentials = { instanceUrl: 'https://op.example.test', apiToken: 'test-api-token' };

describe('OpenProjectAdapter', () => {
  it('discovers the dynamic form, posts the validated payload to commitHref and maps the resulting work package', async () => {
    const request = jest.fn()
      .mockResolvedValueOnce(response(200, { _embedded: { payload: { subject: 'Task', _links: { project: { href: '/api/v3/projects/22' } } }, schema: { subject: { name: 'Subject', required: true }, _links: { name: 'Project', required: true } } }, _links: { commit: { href: '/api/v3/work_packages' } } }))
      .mockResolvedValueOnce(response(201, { id: 31, subject: 'Task', updatedAt: '2026-09-27T10:00:00Z', _links: { html: { href: 'https://op.example.test/work_packages/31' }, project: { href: '/api/v3/projects/22' }, status: { title: 'New' } } }));
    const adapter = new OpenProjectAdapter(request, async () => [{ address: '203.0.113.5', family: 4 }]);
    await expect(adapter.createWorkPackage(credentials, { subject: 'Task', _links: { project: { href: '/api/v3/projects/22' } } })).resolves.toMatchObject({ id: 31, projectId: 22, subject: 'Task', status: 'New' });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][1].method).toBe('POST');
    expect(request.mock.calls[1][0]).toBe('https://op.example.test/api/v3/work_packages');
    expect(request.mock.calls[1][1].headers.Authorization).toMatch(/^Basic /);
  });

  it('surfaces dynamic required field errors without sending the commit request', async () => {
    const request = jest.fn().mockResolvedValue(response(200, { _embedded: { payload: {}, schema: {}, validationErrors: { type: { message: 'required' } } } }));
    const adapter = new OpenProjectAdapter(request, async () => [{ address: '203.0.113.5', family: 4 }]);
    await expect(adapter.createWorkPackage(credentials, {})).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('blocks private instance addresses unless explicitly allowlisted', async () => {
    const adapter = new OpenProjectAdapter(jest.fn(), async () => [{ address: '10.0.0.4', family: 4 }]);
    await expect(adapter.validateConnection({ instanceUrl: 'https://op.private.test', apiToken: 'test-api-token' })).rejects.toBeInstanceOf(OpenProjectApiError);
  });
});
