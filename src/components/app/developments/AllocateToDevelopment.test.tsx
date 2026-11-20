// @vitest-environment jsdom
import { it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
vi.mock("@tanstack/react-router", () => ({ Link: ({ to, params, children, ...rest }: { to: string; params: { id: string }; children: React.ReactNode }) => <a href={to.replace("$id", params.id)} {...rest}>{children}</a> }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f, createServerFn: () => ({ middleware: () => ({ inputValidator: () => ({ handler: () => vi.fn() }) }) }) }));
vi.mock("@/lib/developments/clone.functions", () => ({ cloneToDevelopment: vi.fn() }));
import { AllocateAction, AllocateResult, AllocateToDevelopmentDialog, allocateText } from "./AllocateToDevelopmentDialog";
import { CloneMarks } from "./CloneMarks";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const result = { copies: [{ original_id: "o1", original_reference: "HB-1126", copy_id: "c1", copy_reference: "HB-1234" }], skipped: [{ original_id: "o2", original_reference: "HB-1127", reason: "deja în ansamblu" }], portalSkipped: [], photoErrors: 0 };

it("butonul „Alocă la ansamblu” apare doar cu selecție", () => {
  expect(renderToStaticMarkup(<AllocateAction count={0} onClick={() => {}} />)).toBe("");
  expect(renderToStaticMarkup(<AllocateAction count={2} onClick={() => {}} />)).toContain("Alocă la ansamblu");
});

it("dialogul trimite ID-urile selectate și ansamblul ales, apoi afișează perechile", async () => {
  const run = vi.fn(async () => result);
  const onDone = vi.fn();
  const el = document.createElement("div"); document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => root.render(<QueryClientProvider client={new QueryClient()}><AllocateToDevelopmentDialog open onOpenChange={() => {}} propertyIds={["o1", "o2"]} developments={[{ id: "dev-1", name: "Parcul Verde" }]} onDone={onDone} run={run} /></QueryClientProvider>));
  expect(document.body.textContent).toContain(allocateText(2));
  expect(allocateText(2)).toBe("Se vor crea 2 copii noi cu referințe noi. Anunțurile originale rămân neschimbate.");
  const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Creează"))!;
  await act(async () => { btn.click(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(run).toHaveBeenCalledWith({ data: { developmentId: "dev-1", propertyIds: ["o1", "o2"] } });
  expect(onDone).toHaveBeenCalled();
  expect(document.body.textContent).toContain("HB-1126 → HB-1234");
  root.unmount();
});

it("rezultatul listează perechile și cele sărite cu motivul", () => {
  const html = renderToStaticMarkup(<AllocateResult result={result} />);
  expect(html).toContain("HB-1126 → HB-1234");
  expect(html).toContain("HB-1127: deja în ansamblu");
});

it("marcajele „Copie a …” și „Copiat în …”", () => {
  const copy = renderToStaticMarkup(<CloneMarks copyOf={{ id: "o1", reference: "HB-1126" }} />);
  expect(copy).toContain("Copie a");
  expect(copy).toContain('href="/app/properties/o1"');
  expect(copy).toContain("HB-1126");
  const orig = renderToStaticMarkup(<CloneMarks copiedIn={[{ copyId: "c1", developmentId: "d1", developmentName: "Parcul Verde" }, { copyId: "c2", developmentId: "d2", developmentName: "Lacul" }]} />);
  expect(orig).toContain("Copiat în: Parcul Verde");
  expect(orig).toContain("Copiat în: Lacul");
  expect(orig).toContain('href="/app/properties/c1"');
  expect(renderToStaticMarkup(<CloneMarks />)).toBe("");
});
