/** Implementações reais ficam atrás deste contrato; importações nunca canonizam requisitos automaticamente. */
export interface IntegrationAdapter {
  readonly kind: 'GITHUB' | 'GOOGLE';
  validateConnection(credentials: Record<string, string>): Promise<{ account: string }>;
  listSources(credentials: Record<string, string>): Promise<Array<{ externalId: string; name: string; mimeType?: string }>>;
  readSource(credentials: Record<string, string>, externalId: string): Promise<{ title: string; content: string }>;
}
