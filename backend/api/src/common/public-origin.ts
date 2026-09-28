import { isIP } from 'node:net';

function isNonPublicIp(hostname: string) {
  const family = isIP(hostname);
  if (family === 4) {
    const [a, b] = hostname.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224;
  }
  if (family === 6) {
    const normalized = hostname.toLowerCase();
    // Global unicast IPv6 addresses are in 2000::/3. Reject loopback,
    // link-local, unique-local, mapped IPv4, and other special ranges.
    return !/^[23]/.test(normalized) || normalized.startsWith('2001:db8:');
  }
  return false;
}

/** Returns the configured app origin and rejects local/private origins in production. */
export function resolveAppOrigin(value?: string, requirePublic = false) {
  if (!value) throw new Error('APP_ORIGIN is not configured.');
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('APP_ORIGIN must be an HTTP(S) origin.');
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  const localName = hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local');
  if (requirePublic && (parsed.protocol !== 'https:' || localName || isNonPublicIp(hostname))) {
    throw new Error('APP_ORIGIN must be a public HTTPS origin.');
  }
  return parsed.origin;
}
