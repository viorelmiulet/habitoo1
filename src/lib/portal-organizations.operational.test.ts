import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], rpc: vi.fn(), from: vi.fn(), grace: vi.fn(), totals: {}, stats: [] as Record<string, unknown>[], inactive: [] as Record<string, unknown>[] }));
vi.mock('@tanstack/react-start', () => ({ createServerFn: () => {
  let validate: (input: unknown) => unknown = x => x;
  const builder = { middleware: () => builder, inputValidator: (fn: typeof validate) => { validate = fn; return builder; }, handler: (fn: (input: unknown) => unknown) => (input: {data?: unknown} = {}) => fn({ data: validate(input.data), context: { supabase: { rpc: mock.rpc }, userId: 'admin' } }) };
  return builder;
} }));
vi.mock('@/lib/org-access', () => ({ requireActiveOrgAuth: {} }));
vi.mock('@/lib/feed-registry', () => ({ feedDefinitions: () => [] }));
vi.mock('@/integrations/supabase/auth-middleware', () => ({ requireSupabaseAuth: {} }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: mock.from } }));
vi.mock('@/lib/operational-agency-stats.server', () => ({ readGraceAgencyStats: mock.grace }));
import { listPortalOrganizations } from './portals.functions';
import { getAgencyStats } from './superadmin-stats.functions';
const ids = Array.from({ length: 8 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-27T04:49:00Z'));
  mock.rows = [
    { id: ids[0], name: 'Activă', status: 'active' },
    { id: ids[1], name: 'Trial', status: 'trial', subscription_expires_at: '2026-12-01' },
    { id: ids[2], name: 'Grație', status: 'active', subscription_expires_at: '2026-11-23' },
    { id: ids[3], name: 'Expirată', status: 'active', subscription_expires_at: '2026-11-20' },
    { id: ids[4], name: 'Suspendată', status: 'suspended' },
    { id: ids[5], name: 'Anulată', status: 'cancelled' },
    { id: ids[6], name: 'Așteptare', status: 'pending_approval' },
    { id: ids[7], name: 'Arhivată', status: 'active', archived_at: '2026-11-26' },
  ];
  mock.from.mockImplementation(() => {
    const q = { select: () => q, order: () => q, range: async (from: number, to: number) => ({ data: mock.rows.slice(from, to + 1), error: null }) };
    return q;
  });
  mock.stats = mock.rows.filter(row => row.name !== 'Grație');
  mock.inactive = [{ id: ids[2], last_activity_at: '2026-11-26' }];
  mock.rpc.mockImplementation(async (name: string) => ({ data: name === 'is_superadmin' ? true : name === 'superadmin_agency_stats' ? mock.stats : name === 'superadmin_inactive_agencies' ? mock.inactive : mock.totals, error: null }));
  mock.grace.mockImplementation(async (_db: unknown, org: Record<string, unknown>) => ({ ...org, listings_total: 9 }));
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
it('operationalOnly exclude expirate/suspendate/anulate/în așteptare/arhivate, include grația', async () => {
  const rows = await listPortalOrganizations({ data: { operationalOnly: true } });
  expect(rows.map(row => row.name)).toEqual(['Activă', 'Trial', 'Grație']);
});
it('fără opțiune păstrează toate agențiile pentru jurnale și Storia', async () => {
  const rows = await listPortalOrganizations({});
  expect(rows).toHaveLength(8);
  expect(rows.map(row => row.name)).toEqual(mock.rows.map(row => row['name']));
});
it.each([[3, 'Expirată'], [4, 'Suspendată'], [7, 'Arhivată']])('linkul direct păstrează agenția %s și eticheta de stare', async (index, label) => {
  const id = ids[index];
  if (!id) throw new Error('Lipsește ID-ul testului');
  const rows = await listPortalOrganizations({ data: { operationalOnly: true, includeOrganizationId: id } });
  expect(rows).toHaveLength(4);
  expect(rows.find(row => row.id === id)).toMatchObject({ statusLabel: label });
});
it('utilizarea exclude agențiile neoperaționale și recuperează agregatele reale ale grației', async () => {
  const result = await getAgencyStats({ data: { operationalOnly: true } });
  expect(result.agencies.map(row => row.name)).toEqual(['Activă', 'Trial', 'Grație']);
  expect(mock.grace).toHaveBeenCalledTimes(1);
  expect(result.agencies.find(row => row.name === 'Grație')?.listings_total).toBe(9);
  expect(result.inactiveAgencies).toEqual(mock.inactive);
});
it('citirea statisticilor fără opțiune păstrează rezultatele istorice', async () => {
  const result = await getAgencyStats({ data: {} });
  expect(result.agencies).toEqual(mock.stats);
  expect(mock.grace).not.toHaveBeenCalled();
});
it('refuză citirea dacă solicitantul nu este superadmin', async () => {
  mock.rpc.mockResolvedValue({ data: false, error: null });
  await expect(listPortalOrganizations({ data: { operationalOnly: true } })).rejects.toThrow('Acces refuzat');
  expect(mock.from).not.toHaveBeenCalled();
});
