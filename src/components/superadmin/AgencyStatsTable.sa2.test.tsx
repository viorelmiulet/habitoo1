// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { SANDBOX_AGENCY_ID } from '@/lib/partner-api/sandbox-identity';
import { AgencyStatsTable } from './AgencyStatsTable';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), query: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({ Link: ({ to, params, children, ...props }: any) => <a href={to.replace('$id', params.id)} {...props}>{children}</a> }));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock('@/lib/superadmin-stats.functions', () => ({ getAgencyStats: mocks.fetch, getAgencyAgentStats: vi.fn() }));
vi.mock('@/lib/portals/registry', () => ({ getPortalDefinition: () => null }));
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: unknown) => { mocks.query(options); return { isLoading: false, data: {
  agencies: [
    { id: 'A', name: 'A', status: 'active' }, { id: 'T', name: 'T', status: 'trial' },
    { id: 'G', name: 'G', status: 'active', subscription_expires_at: '2026-11-23' },
    { id: 'E', name: 'E', status: 'active', subscription_expires_at: '2026-11-20' },
    { id: 'S', name: 'S', status: 'suspended' }, { id: 'C', name: 'C', status: 'cancelled' },
    { id: 'P', name: 'P', status: 'pending_approval' }, { id: 'R', name: 'R', status: 'active', archived_at: '2026-11-26' },
    { id: SANDBOX_AGENCY_ID, name: 'Habitoo Partner API Sandbox', status: 'active', is_demo: true },
  ].map(row => ({ ...row, listings_active: 1, listings_total: 1, listings_by_status: { active: 1 }, portals: [], plan: 'basic' })),
  inactiveAgencies: [{ id: 'S', name: 'S', inactive_reason: 'suspended' }],
} }; } }));
const containers: HTMLDivElement[] = [];
afterEach(() => { containers.splice(0).forEach(c => c.remove()); vi.useRealTimers(); vi.clearAllMocks(); });
it('utilizarea conține doar active, trial și grație; citirea cere operationalOnly', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-27T04:49:00Z'));
  const container = document.createElement('div'); document.body.append(container); containers.push(container);
  const root = createRoot(container);
  await act(async () => root.render(<AgencyStatsTable />));
  expect([...container.querySelectorAll('tbody a')].map(a => a.textContent)).toEqual(['A', 'T', 'G']);
  const options = mocks.query.mock.calls[0]?.[0] as { queryFn: () => unknown };
  options.queryFn();
  expect(mocks.fetch).toHaveBeenCalledWith({ data: { includeDemo: false, operationalOnly: true } });
  await act(async () => root.unmount());
});
