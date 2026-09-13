import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.TEST_DATABASE_URL;
const safeDatabase = Boolean(databaseUrl && /(?:^|\/)(athena_test|athena_test_[^/?]+)(?:\?|$)/.test(databaseUrl));
if (databaseUrl && !safeDatabase) throw new Error('TEST_DATABASE_URL deve apontar explicitamente para um banco athena_test ou athena_test_*');
const describeDb = safeDatabase ? describe : describe.skip;

describeDb('ATH-013 PostgreSQL migration', () => {
  let prisma: PrismaClient;
  beforeAll(() => { prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } }); });
  afterAll(() => prisma?.$disconnect());

  it('exposes additive suggestion schema while retaining legacy impact tables', async () => {
    const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('ImpactAnalysis', 'ImpactItem', 'AiSuggestion')
    `;
    expect(rows.map((row) => row.table_name).sort()).toEqual(['AiSuggestion', 'ImpactAnalysis', 'ImpactItem']);
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'AiSuggestion'
    `;
    expect(columns.map((column) => column.column_name)).toEqual(expect.arrayContaining([
      'analysisId', 'requirementId', 'targetRequirementId', 'url', 'confidence', 'justification', 'status', 'error',
    ]));
  });
});
