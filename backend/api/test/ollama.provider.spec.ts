import { OllamaProvider } from '../src/ai/ollama.provider';

describe('OllamaProvider', () => {
  afterEach(() => jest.restoreAllMocks());
  it('sends the bounded global dependency contract', async () => {
    const source = '11111111-1111-4111-8111-111111111111'; const target = '22222222-2222-4222-8222-822222222222';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ response: JSON.stringify({ dependencies: [{ sourceRequirementId: source, targetRequirementId: target, confidence: .9, justification: 'Necessária' }] }) }) } as Response);
    const provider = new OllamaProvider('http://ollama.test', 'llama3.2', 'embed', 1000);
    await expect(provider.analyseDependencies({ sources: [{ id: source, candidates: [{ id: target }] }] })).resolves.toMatchObject({ dependencies: [{ sourceRequirementId: source }] });
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as { prompt: string; model: string; format: unknown };
    expect(body.model).toBe('llama3.2'); expect(body.prompt).toContain('Responda exclusivamente com JSON válido'); expect(body.format).toEqual(expect.objectContaining({ type: 'object' }));
  });
});
