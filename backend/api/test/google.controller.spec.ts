import { GoogleOAuthController } from '../src/integrations/google.controller';

describe('GoogleOAuthController', () => {
  const previousOrigin = process.env.WEB_ORIGIN;
  afterEach(() => { if (previousOrigin === undefined) delete process.env.WEB_ORIGIN; else process.env.WEB_ORIGIN = previousOrigin; });

  it('returns the browser to ATHENA after a successful callback', async () => {
    process.env.WEB_ORIGIN = 'https://athena.example.test';
    const google = { callback: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1', kind: 'GOOGLE', status: 'CONNECTED' }) } as any;
    const response = { redirect: jest.fn() } as any;
    await new GoogleOAuthController(google).callback('state', 'code', response);
    expect(google.callback).toHaveBeenCalledWith('state', 'code');
    expect(response.redirect).toHaveBeenCalledWith(303, 'https://athena.example.test/?integration=google&status=connected&workspaceId=workspace-1');
  });
});
