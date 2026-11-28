import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { ImopediaPackageBoostInfo } from "./ImopediaPackageBoostInfo";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
const state = vi.hoisted(() => ({
  data: undefined as { published: boolean; available: number | null; error: string | null } | undefined,
  error: null as Error | null,
  isError: false,
  isLoading: false,
  options: null as null | { queryFn: () => Promise<unknown>; staleTime: number },
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.load }));
vi.mock("@tanstack/react-query", () => ({ useQuery: (options: typeof state.options) => { state.options = options; return state; } }));
vi.mock("@/lib/portals/imopedia/boost.functions", () => ({ getImopediaBoostInfo: {}, IMOPEDIA_BOOST_CACHE_MS: 300_000 }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

beforeEach(() => {
  mocks.load.mockReset();
  state.data = undefined;
  state.error = null;
  state.isError = false;
  state.isLoading = false;
  state.options = null;
});

async function renderInfo() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<ImopediaPackageBoostInfo organizationId="o1" />));
  return { container, root };
}

it("citește pachetul agenției fără proprietate și păstrează cache-ul de 5 minute", async () => {
  state.data = { published: true, available: 4, error: null };
  mocks.load.mockResolvedValue(state.data);
  const { container, root } = await renderInfo();
  try {
    expect(container.textContent).toContain("Pachet Imopedia: 4 boost-uri disponibile");
    expect(state.options?.staleTime).toBe(300_000);
    await state.options?.queryFn();
    expect(mocks.load).toHaveBeenCalledWith({ data: { organizationId: "o1" } });
    expect(container.querySelector("button")).toBeNull();
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it("afișează motivul primit de la Imopedia", async () => {
  state.data = { published: true, available: null, error: "Sesiune refuzată" };
  const { container, root } = await renderInfo();
  try {
    expect(container.textContent).toContain("Boost-uri: necunoscute (Sesiune refuzată)");
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it("afișează motivul unei erori de citire", async () => {
  state.isError = true;
  state.error = new Error("Conexiune indisponibilă");
  const { container, root } = await renderInfo();
  try {
    expect(container.textContent).toContain("Boost-uri: necunoscute (Conexiune indisponibilă)");
  } finally { await act(async () => root.unmount()); container.remove(); }
});
