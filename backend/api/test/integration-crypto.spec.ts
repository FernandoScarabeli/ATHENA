import { IntegrationCrypto } from '../src/integrations/crypto.service';

describe('IntegrationCrypto', () => {
  const valid = Buffer.alloc(32, 7).toString('base64');
  const previous = process.env.INTEGRATION_ENCRYPTION_KEY;
  afterEach(() => { if (previous === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY; else process.env.INTEGRATION_ENCRYPTION_KEY = previous; });

  it('validates a base64 32-byte key at construction and round-trips ciphertext', () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = valid;
    const crypto = new IntegrationCrypto();
    const encrypted = crypto.encrypt(JSON.stringify({ token: 'never-returned' }));
    expect(encrypted).not.toContain('never-returned');
    expect(crypto.decrypt(encrypted)).toBe('{"token":"never-returned"}');
  });

  it.each(['', 'not-base64', Buffer.alloc(16).toString('base64')])('rejects invalid key %s', key => {
    process.env.INTEGRATION_ENCRYPTION_KEY = key;
    expect(() => new IntegrationCrypto()).toThrow(/INTEGRATION_ENCRYPTION_KEY/);
  });

  it('rejects tampering', () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = valid;
    const crypto = new IntegrationCrypto();
    const bytes = Buffer.from(crypto.encrypt('secret'), 'base64'); bytes[bytes.length - 1] ^= 1;
    expect(() => crypto.decrypt(bytes.toString('base64'))).toThrow();
  });
});
