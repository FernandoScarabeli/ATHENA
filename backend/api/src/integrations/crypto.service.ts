import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
/** AES-256-GCM para credenciais persistidas; a chave deve ter 32 bytes em base64. */
export class IntegrationCrypto {
  private key = Buffer.from(process.env.INTEGRATION_ENCRYPTION_KEY ?? '', 'base64');
  encrypt(value: string) { if (this.key.length !== 32) throw new Error('INTEGRATION_ENCRYPTION_KEY inválida'); const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',this.key,iv); return Buffer.concat([iv,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64'); }
  decrypt(value: string) { if (this.key.length !== 32) throw new Error('INTEGRATION_ENCRYPTION_KEY inválida'); const raw=Buffer.from(value,'base64'),iv=raw.subarray(0,12),tag=raw.subarray(raw.length-16),body=raw.subarray(12,raw.length-16),cipher=createDecipheriv('aes-256-gcm',this.key,iv);cipher.setAuthTag(tag);return Buffer.concat([cipher.update(body),cipher.final()]).toString('utf8'); }
}
