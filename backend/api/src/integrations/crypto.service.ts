import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';

/** AES-256-GCM for persisted integration credentials. The key is never logged or returned. */
@Injectable()
export class IntegrationCrypto implements OnModuleInit {
  private readonly key: Buffer;

  constructor() {
    this.key = IntegrationCrypto.readKey(process.env.INTEGRATION_ENCRYPTION_KEY);
  }

  onModuleInit() { /* Constructor validation makes startup fail before serving requests. */ }

  private static readKey(value?: string): Buffer {
    if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
      throw new Error('INTEGRATION_ENCRYPTION_KEY deve ser base64 de exatamente 32 bytes');
    }
    const key = Buffer.from(value, 'base64');
    if (key.length !== 32) throw new Error('INTEGRATION_ENCRYPTION_KEY deve ser base64 de exatamente 32 bytes');
    return key;
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    return Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64');
  }

  decrypt(value: string): string {
    const raw = Buffer.from(value, 'base64');
    if (raw.length < 12 + 16) throw new Error('Credencial cifrada inválida');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(raw.length - 16);
    const body = raw.subarray(12, raw.length - 16);
    const cipher = createDecipheriv('aes-256-gcm', this.key, iv);
    cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(body), cipher.final()]).toString('utf8');
  }
}
