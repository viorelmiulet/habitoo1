// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DevelopmentPortalSelections } from './DevelopmentPortalSelections';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  loadStates: vi.fn(),
  save: vi.fn(),
  legacySave: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock('@/lib/developments/portal-selections.functions', () => ({
  getDevelopmentPortalSelections: (input: unknown) => mocks.load(input),
  getDevelopmentPortalStates: (input: unknown) => mocks.loadStates(input),
  setDevelopmentPortalSelections: (input: unknown) => mocks.save(input),
  setDevelopmentPortalSelection: (input: unknown) => mocks.legacySave(input),
}));
vi.mock('@/components/ui/sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));

type SelectionsData = {
  portals: { id: string; name: string }[];
  selections: { development_id: string; portal_key: string; enabled: boolean }[];
  job: null | {
    id: string;
    portal_key: string;
    enabled: boolean;
    changes: { portal_key: string; enabled: boolean }[] | null;
    status: string;
    total: number;
    processed: number;
    result: unknown;
    last_error: string | null;
  };
};

const baseData = (): SelectionsData => ({
  portals: [{ id: 'storia', name: 'Storia' }, { id: 'cauta', name: 'cauta.ro' }, { id: 'imobli', name: 'imobli.ro' }],
  selections: [{ development_id: 'd', portal_key: 'cauta', enabled: true }],
  job: null,
});

const mounted: { root: Root; container: HTMLDivElement; qc: QueryClient }[] = [];

async function flush() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
}

async function render(data = baseData(), editable = true) {
  mocks.load.mockResolvedValue(data);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  mounted.push({ root, container, qc });
  await act(async () => {
    root.render(<QueryClientProvider client={qc}><DevelopmentPortalSelections id="d" editable={editable} storiaConnected /></QueryClientProvider>);
  });
  await flush();
  return container;
}

function checkbox(container: HTMLElement, label: string) {
  const element = container.querySelector(`[aria-label="${label}"]`);
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Lipsește bifa ${label}`);
  return element;
}

function button(container: HTMLElement, text: string) {
  const element = [...container.querySelectorAll('button')].find(item => item.textContent === text);
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Lipsește butonul ${text}`);
  return element;
}

async function click(element: HTMLElement) {
  await act(async () => { element.click(); });
  await flush();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadStates.mockResolvedValue({ portals: [] });
  mocks.save.mockResolvedValue({ ok: true, jobId: '8a720502-62a4-4df0-a108-aa83888f2de2', changes: [] });
});

afterEach(async () => {
  while (mounted.length) {
    const item = mounted.pop();
    if (!item) break;
    await act(async () => item.root.unmount());
    item.qc.clear();
    item.container.remove();
  }
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('două bife schimbate nu apelează serverul și afișează 2 modificări de aplicat', async () => {
  const container = await render();
  await click(checkbox(container, 'cauta.ro'));
  await click(checkbox(container, 'imobli.ro'));
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.legacySave).not.toHaveBeenCalled();
  expect(container.textContent).toContain('2 modificări de aplicat');
  expect(button(container, 'Renunță la modificări')).toBeDefined();
});

it('Salvează și publică trimite ambele modificări într-un singur apel', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const container = await render();
  await click(checkbox(container, 'cauta.ro'));
  await click(checkbox(container, 'imobli.ro'));
  await click(button(container, 'Salvează și publică'));
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.save).toHaveBeenCalledWith({ data: { id: 'd', changes: [
    { portalKey: 'cauta', enabled: false },
    { portalKey: 'imobli', enabled: true },
  ] } });
});

it('fără modificări butonul este dezactivat, iar Storia nu poate fi bifată fără cont', async () => {
  const data = baseData();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mounted.push({ root, container, qc });
  mocks.load.mockResolvedValue(data);
  await act(async () => {
    root.render(<QueryClientProvider client={qc}><DevelopmentPortalSelections id="d" editable storiaConnected={false} /></QueryClientProvider>);
  });
  await flush();
  expect(button(container, 'Salvează și publică').disabled).toBe(true);
  expect(checkbox(container, 'Storia — Cont dezvoltator').disabled).toBe(true);
  expect(container.textContent).not.toContain('Renunță la modificări');
});

it('o debifare cere confirmare, iar la refuz nu se trimite nimic', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const container = await render();
  await click(checkbox(container, 'cauta.ro'));
  await click(button(container, 'Salvează și publică'));
  expect(confirm).toHaveBeenCalledWith('Retragi unitățile ansamblului de pe: cauta.ro?');
  expect(mocks.save).not.toHaveBeenCalled();
  expect(container.textContent).toContain('1 modificare de aplicat');
  expect(checkbox(container, 'cauta.ro').getAttribute('aria-checked')).toBe('false');
});

it('cu operație în curs bifele și butonul sunt dezactivate și apar progresul și portalurile', async () => {
  const data = baseData();
  data.job = {
    id: '8a720502-62a4-4df0-a108-aa83888f2de2', portal_key: 'storia', enabled: true,
    changes: [{ portal_key: 'storia', enabled: true }, { portal_key: 'imobli', enabled: true }],
    status: 'running', total: 12, processed: 4, result: null, last_error: null,
  };
  const container = await render(data);
  expect(checkbox(container, 'cauta.ro').disabled).toBe(true);
  expect(checkbox(container, 'imobli.ro').disabled).toBe(true);
  expect(button(container, 'Salvează și publică').disabled).toBe(true);
  expect(container.textContent).toContain('În curs: 4 din 12 unități');
  expect(container.textContent).toContain('Portaluri: Storia, imobli.ro');
  expect(container.textContent).toContain('Ultima operație — Storia, imobli.ro');
});

it('eroarea serverului păstrează ciorna și afișează mesajul primit', async () => {
  mocks.save.mockRejectedValue(new Error('Storia: contul dezvoltator nu este conectat.'));
  const container = await render();
  await click(checkbox(container, 'imobli.ro'));
  await click(button(container, 'Salvează și publică'));
  expect(checkbox(container, 'imobli.ro').getAttribute('aria-checked')).toBe('true');
  expect(container.textContent).toContain('1 modificare de aplicat');
  expect(mocks.error).toHaveBeenCalledWith('Storia: contul dezvoltator nu este conectat.');
});

it('răspunsul fără schimbări golește ciorna fără mesaj de pornire', async () => {
  mocks.save.mockResolvedValue({ ok: true, jobId: null, changes: [] });
  const container = await render();
  await click(checkbox(container, 'imobli.ro'));
  await click(button(container, 'Salvează și publică'));
  expect(mocks.success).not.toHaveBeenCalled();
  expect(container.textContent).not.toContain('1 modificare de aplicat');
  expect(checkbox(container, 'imobli.ro').getAttribute('aria-checked')).toBe('false');
});

it('afișează starea la portalul bifat și nimic la cele nebifate', async () => {
  mocks.loadStates.mockResolvedValue({ portals: [
    { portalId: 'cauta', total: 5, published: 3, errors: 1, unpublished: 1, covered: true, selected: 5 },
    { portalId: 'storia', total: 5, published: 4, errors: 0, unpublished: 1, covered: true, selected: 5, developmentState: 'published' },
    { portalId: 'imobli', total: 5, published: 2, errors: 0, unpublished: 3, covered: true, selected: 5 },
  ] });
  const container = await render();
  expect(container.textContent).toContain('3 din 5 unități publicate · 1 cu erori');
  expect(container.textContent).not.toContain('4 din 5 unități publicate');
  expect(container.textContent).not.toContain('2 din 5 unități publicate');
  expect(container.textContent).not.toContain('Ansamblul: Publicat');
});

it('portalul neacoperit afișează numai unitățile bifate', async () => {
  const data = baseData();
  data.selections.push({ development_id: 'd', portal_key: 'imobli', enabled: true });
  mocks.loadStates.mockResolvedValue({ portals: [{ portalId: 'imobli', total: 5, published: 0, errors: 0, unpublished: 0, covered: false, selected: 2 }] });
  const container = await render(data);
  expect(container.textContent).toContain('2 din 5 unități bifate');
  expect(container.textContent).not.toContain('0 din 5 unități publicate');
});

it('starea nu se reîncarcă la fiecare 3 secunde', async () => {
  vi.useFakeTimers();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mounted.push({ root, container, qc });
  mocks.load.mockResolvedValue(baseData());
  await act(async () => {
    root.render(<QueryClientProvider client={qc}><DevelopmentPortalSelections id="d" editable storiaConnected /></QueryClientProvider>);
    await vi.advanceTimersByTimeAsync(30);
  });
  expect(mocks.loadStates).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
  expect(mocks.load).toHaveBeenCalledTimes(2);
  expect(mocks.loadStates).toHaveBeenCalledTimes(1);
});

it('starea se reîncarcă când operația în curs se termină', async () => {
  vi.useFakeTimers();
  const running = baseData();
  running.job = { id: '8a720502-62a4-4df0-a108-aa83888f2de2', portal_key: 'cauta', enabled: true, changes: null, status: 'running', total: 3, processed: 1, result: null, last_error: null };
  mocks.load.mockResolvedValueOnce(running).mockResolvedValue(baseData());
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mounted.push({ root, container, qc });
  await act(async () => {
    root.render(<QueryClientProvider client={qc}><DevelopmentPortalSelections id="d" editable storiaConnected /></QueryClientProvider>);
    await vi.advanceTimersByTimeAsync(30);
  });
  expect(mocks.loadStates).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
  expect(mocks.loadStates).toHaveBeenCalledTimes(2);
});
