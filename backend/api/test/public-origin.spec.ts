import { resolveAppOrigin } from '../src/common/public-origin';

describe('resolveAppOrigin', () => {
  it('uses only the configured public app origin', () => {
    expect(resolveAppOrigin('https://athena.example/path?q=1')).toBe('https://athena.example');
  });

  it.each([
    'http://localhost:8080',
    'https://issue.localhost',
    'https://127.0.0.1:8080',
    'https://[::1]:8080',
    'https://192.168.1.20',
  ])('rejects local or private production origin %s', (origin) => {
    expect(() => resolveAppOrigin(origin, true)).toThrow();
  });

  it('allows localhost for a local development origin', () => {
    expect(resolveAppOrigin('http://localhost:8080')).toBe('http://localhost:8080');
  });
});
