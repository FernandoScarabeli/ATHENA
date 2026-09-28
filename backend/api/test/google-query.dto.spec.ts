import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GoogleSyncRunQueryDto, IntegrationActivityQueryDto } from '../src/integrations/google.dto';

describe('Google integration pagination query DTOs', () => {
  it.each([
    ['integration activity', IntegrationActivityQueryDto],
    ['sync runs', GoogleSyncRunQueryDto],
  ])('converts the %s limit query string to a number', async (_name, QueryDto) => {
    const query = plainToInstance(QueryDto, { limit: '30' });
    expect(query.limit).toBe(30);
    await expect(validate(query)).resolves.toHaveLength(0);
  });

  it('accepts ISO date bounds and supported status filters for activity history', async () => {
    const query = plainToInstance(IntegrationActivityQueryDto, {
      from: '2026-09-10T03:00:00.000Z', to: '2026-09-13T03:00:00.000Z', status: 'FAILED',
    });
    await expect(validate(query)).resolves.toHaveLength(0);
  });
});
