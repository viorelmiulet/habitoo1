import { beforeEach, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const mocks = vi.hoisted(() => ({
  activated: vi.fn(),
  compute: vi.fn(),
  tables: {} as Record<string, Row[]>,
  failDevelopment: false,
}));

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    let validate: (value: unknown) => unknown = value => value;
    const builder = {
      middleware: () => builder,
      inputValidator: (validator: (value: unknown) => unknown) => { validate = validator; return builder; },
      handler: (handler: (value: unknown) => unknown) => async (input: { data: unknown }) => handler({
        data: validate(input.data),
        context: { supabase: { from }, userId: 'actor' },
      }),
    };
    return builder;
  },
}));
vi.mock('@/lib/org-access', () => ({ requireActiveOrgAuth: {} }));
vi.mock('@/lib/portals.functions', () => ({ activatedPortalIds: mocks.activated, computeOrgPortalStates: mocks.compute }));
vi.mock('@/lib/site-feed/complete-read.server', () => ({
  readCompleteRows: async (build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>) => {
    const result = await build(0, 999);
    if (result.error) throw result.error;
    return result.data ?? [];
  },
}));

function from(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  const run = () => ({
    data: table === 'developments' && mocks.failDevelopment ? null : (mocks.tables[table] ?? []).filter(row => filters.every(filter => filter(row))),
    error: table === 'developments' && mocks.failDevelopment ? { message: 'inaccesibil' } : null,
  });
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
    is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return query; },
    in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
    order: () => query,
    range: () => query,
    single: async () => { const result = run(); return { data: result.data?.[0] ?? null, error: result.error }; },
    maybeSingle: async () => { const result = run(); return { data: result.data?.[0] ?? null, error: result.error }; },
    then: (resolve: (result: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return query;
}

import { readDevelopmentPortalStates } from './portal-status.server';

const id = '00000000-0000-4000-8000-000000000030';
const cell = (portalId: string, state: string, selected = true) => ({ portalId, state, selected });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.failDevelopment = false;
  mocks.activated.mockResolvedValue(new Set(['clickimob']));
  mocks.tables = {
    developments: [{ id, organization_id: 'org' }],
    properties: [
      { id: 'u1', organization_id: 'org', development_id: id, deleted_at: null },
      { id: 'u2', organization_id: 'org', development_id: id, deleted_at: null },
      { id: 'u3', organization_id: 'org', development_id: id, deleted_at: null },
    ],
    storia_development_units: [
      { id: 's1', organization_id: 'org', development_id: id, property_id: 'u1', status: 'published' },
      { id: 's2', organization_id: 'org', development_id: id, property_id: 'u2', status: 'error' },
      { id: 's3', organization_id: 'org', development_id: id, property_id: 'u3', status: 'pending' },
      { id: 'outside', organization_id: 'org', development_id: 'other', property_id: 'outside', status: 'published' },
    ],
    development_portal_publications: [{ development_id: id, portal: 'storia', status: 'published' }],
    portal_publications: [],
  };
  mocks.compute.mockResolvedValue(new Map([
    ['u1', [cell('clickimob', 'in_feed')]],
    ['u2', [cell('clickimob', 'error')]],
    ['u3', [cell('clickimob', 'selected')]],
  ]));
});

it('funcția folosește regula comună doar cu unitățile neșterse ale ansamblului', async () => {
  const result = await readDevelopmentPortalStates({ from } as never, id);
  expect(mocks.compute).toHaveBeenCalledWith('org', { propertyIds: ['u1', 'u2', 'u3'], portalIds: new Set(['clickimob']) });
  expect(result.portals.find(portal => portal.portalId === 'clickimob')).toMatchObject({ total: 3, published: 1, errors: 1, unpublished: 1, covered: true });
});

it('Storia numără din storia_development_units și întoarce starea ansamblului separat', async () => {
  const result = await readDevelopmentPortalStates({ from } as never, id);
  expect(result.portals.find(portal => portal.portalId === 'storia')).toMatchObject({ total: 3, published: 1, errors: 1, unpublished: 1, developmentState: 'published' });
});

it('portalul neacoperit primește doar numărul unităților bifate', async () => {
  mocks.compute.mockResolvedValue(new Map([['u1', []], ['u2', []], ['u3', []]]));
  mocks.tables.portal_publications = [
    { property_id: 'u1', organization_id: 'org', portal_key: 'clickimob', enabled: true },
    { property_id: 'u2', organization_id: 'org', portal_key: 'clickimob', enabled: true },
    { property_id: 'outside', organization_id: 'org', portal_key: 'clickimob', enabled: true },
  ];
  const result = await readDevelopmentPortalStates({ from } as never, id);
  expect(result.portals.find(portal => portal.portalId === 'clickimob')).toMatchObject({ covered: false, selected: 2, total: 3, published: 0, errors: 0, unpublished: 0 });
});

it('un ansamblu inaccesibil nu pornește calculul privilegiat', async () => {
  mocks.failDevelopment = true;
  await expect(readDevelopmentPortalStates({ from } as never, id)).rejects.toThrow('Ansamblu inaccesibil.');
  expect(mocks.compute).not.toHaveBeenCalled();
});
