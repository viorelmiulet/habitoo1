// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AutofillProposal } from "@/lib/ai/listing-autofill/schema";

const enabled = { value: false };
const runResult: { value: unknown } = { value: null };
vi.mock("@/hooks/use-ai-features", () => ({ useAiFeatures: () => ({ isLoading: false, isEnabled: () => enabled.value }) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => () => Promise.resolve(runResult.value) }));
vi.mock("@/lib/ai/listing-autofill/autofill.functions", () => ({ autofillListing: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/storage", () => ({ MEDIA_BUCKET: "media", compressImage: async () => ({ blob: { arrayBuffer: async () => new ArrayBuffer(1) } }), signedUrls: async () => ({ a: "https://example.test/a", b: "https://example.test/b", c: "https://example.test/c" }) }));
vi.mock("@/lib/property-photo-upload", () => ({ reorderPropertyPhotos: vi.fn(async () => undefined) }));

import { ListingAutofillCard } from "./ListingAutofillCard";
import { reorderPropertyPhotos } from "@/lib/property-photo-upload";
import { rememberManualCover } from "@/lib/ai/listing-autofill/photo-order";

type Props = Parameters<typeof ListingAutofillCard>[0];

function renderTree(props: Partial<Props> = {}) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  if (props.propertyId) client.setQueryData(["property-images", props.propertyId], ["a", "b", "c"].map((id, position) => ({ id, storage_path: id, position })));
  vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  const full: Props = {
    mode: "new",
    photos: [],
    onPhotosChange: () => undefined,
    onProposal: (p) => p,
    marked: [],
    onRemoveField: () => undefined,
    onAcceptAll: () => undefined,
    missing: [],
    ...props,
  };
  const render = async (over: Partial<Props> = {}) => {
    await act(async () => root.render(<QueryClientProvider client={client}>
      <ListingAutofillCard {...full} {...over} />
    </QueryClientProvider>));
  };
  return { el, root, render };
}

async function render(props: Partial<Props> = {}) {
  const tree = renderTree(props);
  await tree.render();
  return tree;
}

async function typeText(el: HTMLElement, value: string) {
  const textarea = el.querySelector("textarea")!;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function clickButton(el: HTMLElement, text: string) {
  const button = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes(text))!;
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const proposalWith = (over: Partial<AutofillProposal>): { ok: true; proposal: AutofillProposal } => ({
  ok: true,
  proposal: { values: {}, confidence: {}, sources: {}, title: null, description: null, photoOrder: null, ignored: [], ...over },
});

describe("AI18 aplicare automată și anulare", () => {
  function photoMocks() {
    enabled.value = true;
    let nextUrl = 0;
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => `blob:photo-${nextUrl++}`), revokeObjectURL: vi.fn() }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ blob: async () => new Blob(["image"], { type: "image/jpeg" }) })));
    vi.mocked(reorderPropertyPhotos).mockClear();
    return ["a", "b", "c"].map((name) => new File([name], `${name}.jpg`, { type: "image/jpeg" }));
  }
  it("photo_order valid este aplicat automat și × restaurează ordinea originală la creare", async () => {
    const photos = photoMocks();
    runResult.value = proposalWith({ photoOrder: [2, 0, 1] });
    const onPhotosChange = vi.fn();
    const tree = await render({ photos, onPhotosChange });
    await clickButton(tree.el, "Completează cu AI");
    const ordered = [photos[2], photos[0], photos[1]];
    expect(onPhotosChange).toHaveBeenLastCalledWith(ordered);
    expect([...tree.el.querySelectorAll("button")].some((b) => b.textContent?.includes("Aplică ordinea"))).toBe(false);
    await tree.render({ photos: ordered });
    const undo = tree.el.querySelector("button[aria-label='Anulează ordinea propusă a pozelor']");
    if (!undo) throw new Error("Lipsește anularea ordinii");
    await act(async () => undo.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPhotosChange).toHaveBeenLastCalledWith(photos);
    expect(tree.el.querySelector("button[aria-label='Anulează ordinea propusă a pozelor']")).toBeNull();
  });
  it("coperta aleasă manual rămâne prima la creare", async () => {
    const photos = photoMocks();
    runResult.value = proposalWith({ photoOrder: [2, 1, 0] });
    const onPhotosChange = vi.fn();
    const tree = await render({ photos, onPhotosChange });
    const cover = tree.el.querySelector("button[aria-label='Alege poza 2 drept copertă']");
    if (!cover) throw new Error("Lipsește alegerea copertei");
    await act(async () => cover.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const manual = [photos[1], photos[0], photos[2]];
    await tree.render({ photos: manual });
    await clickButton(tree.el, "Completează cu AI");
    expect(onPhotosChange).toHaveBeenLastCalledWith([photos[1], photos[2], photos[0]]);
    expect(tree.el.textContent).toContain("Coperta aleasă de tine a rămas neschimbată.");
  });
  it("ordine invalidă nu schimbă fotografiile", async () => {
    const photos = photoMocks();
    runResult.value = proposalWith({ photoOrder: [2, 2, 0] });
    const onPhotosChange = vi.fn();
    const tree = await render({ photos, onPhotosChange });
    await clickButton(tree.el, "Completează cu AI");
    expect(onPhotosChange).not.toHaveBeenCalled();
    expect(tree.el.querySelector("button[aria-label='Anulează ordinea propusă a pozelor']")).toBeNull();
  });
  it("editarea aplică imediat funcția existentă și anularea o restaurează", async () => {
    photoMocks();
    runResult.value = proposalWith({ photoOrder: [2, 0, 1] });
    const tree = await render({ mode: "edit", propertyId: "ai18-edit" });
    await clickButton(tree.el, "Completează câmpurile goale cu AI");
    expect(reorderPropertyPhotos).toHaveBeenLastCalledWith(["c", "a", "b"]);
    const undo = tree.el.querySelector("button[aria-label='Anulează ordinea propusă a pozelor']");
    if (!undo) throw new Error("Lipsește anularea galeriei");
    await act(async () => undo.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(reorderPropertyPhotos).toHaveBeenLastCalledWith(["a", "b", "c"]);
  });
  it("editarea respectă coperta manuală din galerie", async () => {
    photoMocks();
    rememberManualCover("ai18-manual", "a");
    runResult.value = proposalWith({ photoOrder: [2, 1, 0] });
    const tree = await render({ mode: "edit", propertyId: "ai18-manual" });
    await clickButton(tree.el, "Completează câmpurile goale cu AI");
    expect(reorderPropertyPhotos).toHaveBeenLastCalledWith(["a", "c", "b"]);
  });
});

describe("cardul Completează cu AI", () => {
  it("funcția oprită → cardul și butonul sunt ascunse", async () => {
    enabled.value = false;
    const { el } = await render();
    expect(el.querySelector("[data-testid=listing-autofill-card]")).toBeNull();
  });
  it("fără poze și fără text → butonul este dezactivat", async () => {
    enabled.value = true;
    const { el } = await render();
    const button = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Completează cu AI"));
    expect(button?.disabled).toBe(true);
  });
  it("cardul nu mai afișează înregistrarea vocală", async () => {
    enabled.value = true;
    const { el } = await render();
    expect(el.textContent).not.toContain("Începe înregistrarea");
    expect(el.textContent).not.toContain("Voce");
  });
});

describe("rezumatul „Completat de AI”", () => {
  it("lista afișează eticheta, valoarea formatată și sursa", async () => {
    enabled.value = true;
    runResult.value = proposalWith({
      values: { rooms: 2, usable_surface: 65 },
      confidence: { rooms: "high", usable_surface: "high" },
      sources: { rooms: "spoken", usable_surface: "spoken" },
    });
    const { el } = await render({ marked: ["rooms", "usable_surface"] });
    await typeText(el, "2 camere, 65 mp");
    await clickButton(el, "Completează cu AI");
    const summary = el.querySelector("[data-testid=autofill-summary]")!;
    expect(summary.textContent).toContain("Completat de AI: 2 câmpuri");
    expect(summary.textContent).toContain("Camere:");
    expect(summary.textContent).toContain("2");
    expect(summary.textContent).toContain("Suprafață utilă:");
    expect(summary.textContent).toContain("65 mp");
    expect(summary.textContent).toContain("din text");
  });

  it("„×” apelează anularea câmpului, iar rândul dispare după demarcare", async () => {
    enabled.value = true;
    runResult.value = proposalWith({
      values: { rooms: 2 },
      confidence: { rooms: "high" },
      sources: { rooms: "spoken" },
    });
    const onRemoveField = vi.fn();
    const tree = renderTree({ marked: ["rooms"], onRemoveField });
    await tree.render();
    await typeText(tree.el, "2 camere");
    await clickButton(tree.el, "Completează cu AI");
    expect(tree.el.querySelector("[data-testid=autofill-summary]")!.textContent).toContain("Camere:");
    const remove = tree.el.querySelector("button[aria-label='Anulează Camere']")!;
    await act(async () => {
      remove.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRemoveField).toHaveBeenCalledWith("rooms");
    // Părintele demarcă câmpul; rândul dispare din listă.
    await tree.render({ marked: [] });
    const summary = tree.el.querySelector("[data-testid=autofill-summary]")!;
    expect(summary.textContent).not.toContain("Camere:");
    expect(summary.textContent).toContain("Nu am găsit câmpuri noi de completat.");
  });

  it("zero câmpuri noi → mesajul „Nu am găsit câmpuri noi de completat.”", async () => {
    enabled.value = true;
    runResult.value = proposalWith({});
    const { el } = await render({ marked: [] });
    await typeText(el, "nimic nou");
    await clickButton(el, "Completează cu AI");
    const summary = el.querySelector("[data-testid=autofill-summary]")!;
    expect(summary.textContent).toContain("Completat de AI: 0 de câmpuri");
    expect(summary.textContent).toContain("Nu am găsit câmpuri noi de completat.");
  });
});
