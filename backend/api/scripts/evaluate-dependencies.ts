/*
 * Offline benchmark runner. It deliberately uses the same Ollama provider
 * contract as production but never writes the benchmark corpus to ATHENA.
 *
 * pnpm --filter @athena/api evaluate:dependencies -- \
 *   --source "/path/to/War Room" [--full] [--threshold 0.60]
 */
import { createHash } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import * as mammoth from 'mammoth';
import { OllamaProvider } from '../src/ai/ollama.provider';

type IndexRow = { id: string; code: string; status: string; title: string; file: string };
type Story = IndexRow & { uuid: string; text: string; vector: number[] };

const fixture = (...parts: string[]) => join(__dirname, '..', 'test', 'fixtures', ...parts);
const parseCsv = (input: string) => {
  const rows: string[][] = []; let row: string[] = []; let value = ''; let quoted = false;
  for (let index = 0; index < input.length; index += 1) { const char = input[index]; const next = input[index + 1]; if (quoted && char === '"' && next === '"') { value += '"'; index += 1; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { row.push(value); value = ''; } else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && next === '\n') index += 1; row.push(value); if (row.some(Boolean)) rows.push(row); row = []; value = ''; } else value += char; }
  if (value || row.length) { row.push(value); rows.push(row); }
  const [headers, ...body] = rows; return body.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
};
const benchmarkUuid = (id: string) => { const hash = createHash('sha256').update(`athena-benchmark:${id}`).digest('hex'); return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`; };
const cosine = (a: number[], b: number[]) => a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
const normalize = (vector: number[]) => { const size = Math.hypot(...vector) || 1; return vector.map(value => value / size); };
async function sourceFile(root: string, logicalFile: string) {
  const alternatives = [join(root, logicalFile), join(root, logicalFile.replace(/^War Room\//, ''))];
  for (const file of alternatives) try { await access(file); return file; } catch { /* try the alternate source layout */ }
  const wanted = basename(logicalFile);
  const visit = async (directory: string): Promise<string | undefined> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) { const candidate = join(directory, entry.name); if (entry.isFile() && entry.name === wanted) return candidate; if (entry.isDirectory()) { const found = await visit(candidate); if (found) return found; } }
    return undefined;
  };
  const found = await visit(root); if (found) return found;
  throw new Error(`Arquivo não encontrado: ${logicalFile}`);
}

async function main() {
  const args = process.argv.slice(2); const sourceIndex = args.indexOf('--source'); const source = sourceIndex >= 0 ? args[sourceIndex + 1] : process.env.ATHENA_BENCHMARK_SOURCE_DIR;
  if (!source) throw new Error('Informe --source "/caminho/para/War Room" ou ATHENA_BENCHMARK_SOURCE_DIR.');
  const full = args.includes('--full'); const thresholdIndex = args.indexOf('--threshold'); const threshold = Number(thresholdIndex >= 0 ? args[thresholdIndex + 1] : process.env.DEPENDENCY_RAG_MIN_SIMILARITY ?? '0.60');
  if (![0.55, 0.60, 0.65, 0.70].includes(threshold)) throw new Error('--threshold deve ser 0.55, 0.60, 0.65 ou 0.70');
  const index = parseCsv(await readFile(fixture('benchmark_index.csv'), 'utf8')) as unknown as Array<{ id_benchmark: string; codigo_original: string; status_documento: string; titulo: string; arquivo_origem: string }>;
  const positives = parseCsv(await readFile(fixture('benchmark_positive_dependencies.csv'), 'utf8')) as unknown as Array<{ origem: string; alvo: string }>;
  const noDependencies = new Set((parseCsv(await readFile(fixture('benchmark_no_dependencies.csv'), 'utf8')) as unknown as Array<{ id_benchmark: string }>).map(item => item.id_benchmark));
  const eligible = index.filter(item => item.status_documento === 'ACTIVE');
  // The 20-US sample is stratified: it contains every endpoint of the 15
  // gold pairs plus neutral distractors, rather than the first 20 CSV rows.
  const endpoints = new Set(positives.flatMap(pair => [pair.origem, pair.alvo]));
  const active = full ? eligible : [...eligible.filter(item => endpoints.has(item.id_benchmark)), ...eligible.filter(item => !endpoints.has(item.id_benchmark))].slice(0, 20);
  const provider = new OllamaProvider();
  const stories: Story[] = [];
  for (const item of active) {
    try { const extracted = await mammoth.extractRawText({ path: await sourceFile(source, item.arquivo_origem) }); stories.push({ id: item.id_benchmark, code: item.codigo_original || item.id_benchmark, status: item.status_documento, title: item.titulo, file: item.arquivo_origem, uuid: benchmarkUuid(item.id_benchmark), text: `${item.titulo}\n${extracted.value}`.replace(/\s+/g, ' ').trim(), vector: [] }); }
    catch (error) { console.warn(`SKIP ${item.id_benchmark}: ${error instanceof Error ? error.message : 'arquivo indisponível'}`); }
  }
  for (let start = 0; start < stories.length; start += 6) { const vectors = await provider.embedMany(stories.slice(start, start + 6).map(item => item.text.slice(0, 5000))); vectors.forEach((vector, index) => { stories[start + index].vector = normalize(vector); }); }
  const expected = new Set(positives.filter(pair => stories.some(item => item.id === pair.origem) && stories.some(item => item.id === pair.alvo)).map(pair => `${pair.origem}:${pair.alvo}`));
  const predicted = new Set<string>(); let candidates = 0;
  for (const sourceStory of stories) {
    const retrieved = stories.filter(target => target.id !== sourceStory.id).map(target => ({ target, similarity: cosine(sourceStory.vector, target.vector) })).filter(item => item.similarity >= threshold).sort((a, b) => b.similarity - a.similarity).slice(0, 6);
    candidates += retrieved.length;
    let response; for (let attempt = 0; attempt < 2 && !response; attempt += 1) try { response = await provider.analyseDependencies({ project: { id: 'benchmark', name: 'ATHENA benchmark', key: 'BENCH' }, sources: [{ id: sourceStory.uuid, code: sourceStory.code, title: sourceStory.title, evidence: sourceStory.text.slice(0, 420), candidates: retrieved.map(({ target }) => ({ id: target.uuid, code: target.code, title: target.title, evidence: target.text.slice(0, 160) })) }], confirmedDependencies: [], dismissedDependencies: [] }); } catch (error) { console.warn(`RETRY ${sourceStory.id} ${attempt + 1}/2: ${error instanceof Error ? error.message : 'erro desconhecido'}`); }
    if (!response) continue;
    const uuidToId = new Map(stories.map(item => [item.uuid, item.id]));
    response.dependencies.filter(item => item.confidence >= 0.80).forEach(item => { const from = uuidToId.get(item.sourceRequirementId); const to = uuidToId.get(item.targetRequirementId); if (from && to) predicted.add(`${from}:${to}`); });
  }
  const correct = [...predicted].filter(pair => expected.has(pair)); const rejected = [...predicted].filter(pair => noDependencies.has(pair.split(':')[0]));
  const precision = predicted.size ? correct.length / predicted.size : 1; const coverage = expected.size ? correct.length / expected.size : 1;
  console.log(JSON.stringify({ us: stories.length, threshold, candidates, averageCandidates: Number((candidates / Math.max(stories.length, 1)).toFixed(2)), suggestions: predicted.size, correctSuggestions: correct.length, precision: Number(precision.toFixed(3)), coverage: Number(coverage.toFixed(3)), rejectedPairs: rejected.length, expectedPairs: expected.size }, null, 2));
  if (precision < 0.90) process.exitCode = 2;
}
void main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
