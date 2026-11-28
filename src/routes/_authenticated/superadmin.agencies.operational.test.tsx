// @vitest-environment jsdom
import { act, type ReactNode, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { SANDBOX_AGENCY_ID } from '@/lib/partner-api/sandbox-identity';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ to, params, children, ...props }: any) => <a href={params ? to.replace('$id', params.id) : to} {...props}>{children}</a>,
}));
vi.mock('@tanstack/react-start', async (original) => ({ ...await original<typeof import('@tanstack/react-start')>(), useServerFn: (fn: unknown) => fn }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/registration-request-details.functions', () => ({ getRegistrationRequestDetails: vi.fn() }));
vi.mock('@/components/superadmin/AgencyAdminActions', () => ({ useRegistrationRequestActions: () => ({ approveRequest: {}, rejectRequest: {} }) }));
vi.mock('@/components/superadmin/AgencyLogo', () => ({ AgencyLogo: () => null, useAgencyLogoUrls: () => ({}) }));
vi.mock('@/components/superadmin/AgencyStatsTable', () => ({ AgencyStatsTable: () => null }));
vi.mock('@/components/app/PageHeader', () => ({ PageHeader: () => null }));
vi.mock('@/components/superadmin/SuperadminUi', () => ({ SummaryCard: () => null, SuperadminSection: ({ children }: { children: ReactNode }) => <section>{children}</section> }));
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: { queryKey: string[] }) => ({ isLoading: false, data: options.queryKey.includes('agencies') ? { orgs: [
  { id: 'A', name: 'A', status: 'active' }, { id: 'T', name: 'T', status: 'trial' },
  { id: 'G', name: 'G', status: 'active', subscription_expires_at: '2026-11-23' },
  { id: 'E', name: 'E', status: 'active', subscription_expires_at: '2026-11-20' },
  { id: 'S', name: 'S', status: 'suspended' }, { id: 'C', name: 'C', status: 'cancelled' },
  { id: 'P', name: 'P', status: 'pending_approval' }, { id: 'R', name: 'R', status: 'active', archived_at: '2026-11-26' },
  { id: SANDBOX_AGENCY_ID, name: 'Habitoo Partner API Sandbox', status: 'active', is_demo: true },
], profiles: [] } : [] }) }));
import { Route } from './superadmin.agencies.index';
afterEach(() => vi.useRealTimers());
it('Toate agențiile exclude toate stările neoperaționale și păstrează grația', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-27T04:49:00Z'));
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  const Page = (Route as unknown as { options: { component: ComponentType } }).options.component;
  await act(async () => root.render(<Page />));
  expect([...container.querySelectorAll('[data-agency-list] a')].map(a => a.getAttribute('href'))).toEqual(['/superadmin/agencies/A', '/superadmin/agencies/T', '/superadmin/agencies/G']);
  await act(async () => root.unmount()); container.remove();
});
