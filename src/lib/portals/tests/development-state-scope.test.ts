import { beforeEach, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  scopedReads: [] as { table: string; column: string; values: unknown[] }[],
}));

vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: (table: string) => from(table) } }));
vi.mock('@/lib/site-feed/mapper', () => ({ isPropertyFeedEligible: () => true }));

function from(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  const run = () => ({ data: (state.tables[table] ?? []).filter(row => filters.every(filter => filter(row))), error: null });
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => { filters.push(row => row[column] === value); return query; },
    in: (column: string, values: unknown[]) => { state.scopedReads.push({ table, column, values }); filters.push(row => values.includes(row[column])); return query; },
    is: (column: string, value: unknown) => { filters.push(row => (row[column] ?? null) === value); return query; },
    order: () => query,
    range: () => query,
    then: (resolve: (result: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return query;
}

import { computeOrgPortalStates } from '@/lib/portals.functions';

beforeEach(() => {
  state.scopedReads = [];
  state.tables = {
    properties: [
      { id: 'u1', organization_id: 'org', publish_status: 'published', status: 'active', deleted_at: null },
      { id: 'u2', organization_id: 'org', publish_status: 'published', status: 'active', deleted_at: null },
      { id: 'u3', organization_id: 'org', publish_status: 'published', status: 'active', deleted_at: null },
      { id: 'outside', organization_id: 'org', publish_status: 'published', status: 'active', deleted_at: null },
    ],
    portal_publications: [
      { property_id: 'u1', organization_id: 'org', portal_key: 'clickimob', enabled: true, status: null },
      { property_id: 'u2', organization_id: 'org', portal_key: 'clickimob', enabled: true, status: null },
      { property_id: 'u3', organization_id: 'org', portal_key: 'clickimob', enabled: false, status: null },
      { property_id: 'outside', organization_id: 'org', portal_key: 'clickimob', enabled: true, status: null },
    ],
    portal_listings: [{ property_id: 'u1', organization_id: 'org', portal: 'clickimob', status: 'published' }],
    portal_connections: [{ portal: 'clickimob', organization_id: 'org', status: 'ready', activated: true }],
    portal_api_keys: [],
    partner_api_publications: [{ property_id: 'u2', organization_id: 'org', portal: 'clickimob', status: 'rejected' }],
  };
});

it('regula listei derivează aceleași stări și citește doar unitățile primite', async () => {
  const result = await computeOrgPortalStates('org', { propertyIds: ['u1', 'u2', 'u3'], portalIds: new Set(['clickimob']) });
  expect([...result.keys()]).toEqual(['u1', 'u2', 'u3']);
  expect(result.get('u1')?.[0]).toMatchObject({ portalId: 'clickimob', state: 'published', selected: true });
  expect(result.get('u2')?.[0]).toMatchObject({ portalId: 'clickimob', state: 'error', selected: true });
  expect(result.get('u3')?.[0]).toMatchObject({ portalId: 'clickimob', state: 'not_selected', selected: false });
  expect(state.scopedReads).toEqual(expect.arrayContaining([
    { table: 'properties', column: 'id', values: ['u1', 'u2', 'u3'] },
    { table: 'portal_publications', column: 'property_id', values: ['u1', 'u2', 'u3'] },
    { table: 'portal_listings', column: 'property_id', values: ['u1', 'u2', 'u3'] },
    { table: 'partner_api_publications', column: 'property_id', values: ['u1', 'u2', 'u3'] },
  ]));
});
