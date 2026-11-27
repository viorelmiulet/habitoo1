// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { PortalOrgSelector } from './PortalOrgSelector';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it('agenția neoperațională din link rămâne selectată și are starea lângă nume', async () => {
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<PortalOrgSelector value="E" onChange={() => {}} orgs={{ isLoading: false, isError: false, error: null, refetch: () => {}, data: [{ id: 'E', name: 'Agenția din link', statusLabel: 'Expirată' }] }} />));
  const selector = container.querySelector('[role="combobox"]');
  expect(selector?.textContent).toContain('Agenția din link');
  expect(selector?.textContent).toContain('Expirată');
  await act(async () => root.unmount()); container.remove();
});
