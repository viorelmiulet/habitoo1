import { expect, it } from 'vitest';
import { readGraceAgencyStats } from './operational-agency-stats.server';
type Row = Record<string, unknown>;
function database(tables: Record<string, Row[]>) {
  return { from: (table: string) => {
    const filters: ((row: Row) => boolean)[] = [];
    let head = false;
    const result = () => ({ data: (tables[table] ?? []).filter(row => filters.every(fn => fn(row))), error: null });
    const q = {
      select: (_columns: string, options?: { head?: boolean }) => { head = options?.head ?? false; return q; },
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return q; },
      is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return q; },
      neq: (key: string, value: unknown) => { filters.push(row => row[key] !== value); return q; },
      gt: (key: string, value: string) => { filters.push(row => String(row[key]) > value); return q; },
      not: (key: string, _op: string, _values: string) => { filters.push(row => !['won', 'lost'].includes(String(row[key]))); return q; },
      order: () => q,
      range: async (from: number, to: number) => ({ ...result(), data: result().data.slice(from, to + 1) }),
      then: (resolve: (result: unknown) => unknown) => Promise.resolve({ ...result(), count: head ? result().data.length : null }).then(resolve),
    };
    return q;
  } };
}
it('agenția în grație primește agregate reale, fără rânduri șterse sau ale altei agenții', async () => {
  const owned = (row: Row) => ({ organization_id: 'G', ...row });
  const db = database({
    properties: [owned({ id: 'p1', status: 'active', created_at: '2026-11-26' }), owned({ id: 'p2', status: 'sold', created_at: '2026-01-01' }),
      owned({ id: 'deleted', status: 'active', deleted_at: '2026-11-26' }), { id: 'other', organization_id: 'OTHER', status: 'active' }],
    portal_publications: [owned({ id: 'pub1', property_id: 'p1', enabled: true, status: 'synced' }), owned({ id: 'pub2', property_id: 'p1', enabled: true, status: 'error' }),
      owned({ id: 'pub3', property_id: 'deleted', enabled: true, status: 'error' }), owned({ id: 'pub4', property_id: 'p1', enabled: false, status: 'error' })],
    profiles: [owned({ id: 'u', is_active: true }), owned({ id: 'inactive', is_active: false })],
    leads: [owned({ id: 'l1', stage: 'new', created_at: '2026-11-26' }), owned({ id: 'l2', stage: 'won', created_at: '2026-11-26' }), owned({ id: 'l3', stage: 'new', deleted_at: '2026-11-26' })],
    requests: [owned({ id: 'r', status: 'active' })], contacts: [owned({ id: 'c' })],
    portal_integrations: [owned({ id: 'i', enabled: true, portal_key: 'mvaimobiliare' }), owned({ id: 'off', enabled: false, portal_key: 'storia' })],
    extension_tokens: [owned({ id: 'token' })], property_capture_sources: [owned({ id: 'source', created_at: '2026-11-26' })],
    ai_credit_ledger: [owned({ id: 'credit', month_start: '2026-11-01', status: 'charged', credits: 10 }), owned({ id: 'refund', month_start: '2026-11-01', status: 'refunded', credits: 40 })],
  });
  const result = await readGraceAgencyStats(db as never, { id: 'G', name: 'Grație', status: 'active' } as never, '2026-11-26', Date.parse('2026-11-27T04:49:00Z'));
  expect(result).toMatchObject({ listings_active: 1, listings_total: 2, listings_by_status: { active: 1, sold: 1 }, listings_published: 1,
    listings_with_errors: 1, listings_added_30d: 1, users_active: 1, leads_new_30d: 2, leads_open: 1,
    requests_active: 1, contacts: 1, portals: ['mvaimobiliare'], catch_enabled: true, catch_imports_30d: 1,
    ai_credits_month: 10, last_activity_at: '2026-11-26' });
});
it('paginează inventarul unei agenții în grație fără trunchiere', async () => {
  const properties = Array.from({ length: 1201 }, (_, id) => ({ id: String(id), organization_id: 'G', status: 'active', created_at: '2026-11-26' }));
  const result = await readGraceAgencyStats(database({ properties }) as never, { id: 'G', status: 'active' } as never, null, Date.parse('2026-11-27T04:49:00Z'));
  expect(result.listings_total).toBe(1201);
  expect(result.listings_active).toBe(1201);
  expect(result.ai_credits_month).toBe(0);
});
