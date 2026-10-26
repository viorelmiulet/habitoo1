/**
 * Teste pentru etapa 2: pregătirea imaginii și extragerea vizuală.
 * Toate imaginile sunt sintetice, generate în test; nu există date reale.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { encode as encodeJpeg } from "jpeg-js";
import { PDFDocument } from "pdf-lib";
import {
  applyOrientation,
  cropBottom,
  downscale,
  sniffIdImageKind,
  MAX_ID_EDGE,
  type Raster,
} from "./prepare";
import { prepareIdUpload, mrzCropAttachment, decodeBase64 } from "./prepare.server";
import { readFrontFromImage, readMrzFromImage } from "./vision.server";
import {
  detectFrontConflicts,
  extractMrzCandidates,
  mrzTextFromCandidates,
  normalizeFrontDate,
  parseFrontVision,
} from "./vision.parse";
import { assessMrzCandidates } from "./quality";
import { checkDigit } from "./mrz";
import { cnpCheckDigit } from "./cnp";
import { readMrz } from "./read";
import type { AIProvider } from "@/lib/ai/providers/types";
import { readIdDocument, getIdReadingStatus } from "../id-document.functions";

const handlerMocks = vi.hoisted(() => ({
  usage: vi.fn(async () => true),
  quota: vi.fn(async () => ({ allowed: true })),
  cap: vi.fn(async () => ({ data: true, error: null })),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      middleware: () => chain,
      inputValidator: () => chain,
      handler: (handler: unknown) => handler,
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: handlerMocks.cap } }));
vi.mock("@/lib/ai/gateway/gateway.server", () => ({ checkAiQuota: handlerMocks.quota }));
vi.mock("@/lib/ai/usage/tracking.server", () => ({ writeAiUsage: handlerMocks.usage }));
vi.mock("@/lib/ai/features/features.server", () => ({ isOrgAiEnabled: async () => true }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function pad(value: string, length: number): string {
  return value.padEnd(length, "<").slice(0, length);
}

function syntheticMrz(options: { documentNumber?: string } = {}): string {
  const docNumber = pad(options.documentNumber ?? "RX123456", 9);
  const cnpBase = "190010112345";
  const cnp = `${cnpBase}${cnpCheckDigit(cnpBase)}`;
  const l1 = `IDROU${docNumber}${checkDigit(docNumber)}${pad(cnp, 15)}`;
  const l2Head = `900101${checkDigit("900101")}M350101${checkDigit("350101")}ROU${pad("", 11)}`;
  const composite =
    l1.slice(5, 30) + l2Head.slice(0, 7) + l2Head.slice(8, 15) + l2Head.slice(18, 29);
  const l2 = `${l2Head}${checkDigit(composite)}`;
  const l3 = pad("POPESCU<<ION<MARIN", 30);
  return [l1, l2, l3].join("\n");
}

function raster(width: number, height: number, fill = 128): Raster {
  const data = new Uint8Array(width * height * 4);
  data.fill(fill);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { data, width, height };
}

function jpegBase64(width: number, height: number): string {
  const image = raster(width, height);
  const encoded = encodeJpeg({ data: image.data, width, height }, 80);
  return Buffer.from(encoded.data).toString("base64");
}

function fakeProvider(
  answers: string[],
): AIProvider & { attachments: string[]; prompts: string[] } {
  const attachments: string[] = [];
  const prompts: string[] = [];
  let call = 0;
  return {
    id: "gemini",
    model: "test-model",
    supportsTools: false,
    attachments,
    prompts,
    async generate(request) {
      prompts.push(request.system);
      const message = request.messages[0];
      if (message && message.role === "user") {
        for (const attachment of message.attachments ?? []) attachments.push(attachment.mimeType);
      }
      const text = answers[Math.min(call, answers.length - 1)] ?? "";
      call += 1;
      return { text, toolCalls: [], inputTokens: 100, outputTokens: 20 };
    },
  };
}

describe("pregătirea imaginii", () => {
  it("recunoaște formatul din semnătura fișierului", () => {
    const jpeg = decodeBase64(jpegBase64(20, 20));
    expect(sniffIdImageKind(jpeg)).toBe("jpeg");
    expect(sniffIdImageKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(
      "png",
    );
    expect(sniffIdImageKind(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBeNull();
  });

  it("rotirea din EXIF schimbă laturile la orientările 5–8", () => {
    const rotated = applyOrientation(raster(4, 2), 6);
    expect([rotated.width, rotated.height]).toEqual([2, 4]);
    const mirrored = applyOrientation(raster(4, 2), 2);
    expect([mirrored.width, mirrored.height]).toEqual([4, 2]);
  });

  it("reduce imaginea la latura maximă și nu o mărește niciodată", () => {
    const reduced = downscale(raster(4000, 2000), MAX_ID_EDGE);
    expect(reduced.width).toBe(MAX_ID_EDGE);
    expect(reduced.height).toBe(800);
    const small = raster(100, 50);
    expect(downscale(small, MAX_ID_EDGE)).toBe(small);
  });

  it("decupează partea de jos a imaginii", () => {
    const crop = cropBottom(raster(100, 300), 0.4);
    expect([crop.width, crop.height]).toEqual([100, 120]);
  });

  it("pregătește un JPEG mare: redus, recodat, tot în memorie", async () => {
    const prepared = await prepareIdUpload({
      contentType: "image/jpeg",
      base64: jpegBase64(3000, 2000),
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.attachment.mimeType).toBe("image/jpeg");
    expect(prepared.raster?.width).toBe(3000);
    expect(prepared.attachment.bytes).toBeGreaterThan(0);
  });

  it("din PDF păstrează doar prima pagină", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 300]);
    doc.addPage([300, 300]);
    const base64 = Buffer.from(await doc.save()).toString("base64");
    const prepared = await prepareIdUpload({ contentType: "application/pdf", base64 });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.attachment.mimeType).toBe("application/pdf");
    const reloaded = await PDFDocument.load(decodeBase64(prepared.attachment.base64));
    expect(reloaded.getPageCount()).toBe(1);
  });

  it("respinge un fișier gol sau necunoscut cu motiv acționabil", async () => {
    const empty = await prepareIdUpload({ contentType: "image/jpeg", base64: "" });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toBe("image_empty");
    const unknown = await prepareIdUpload({
      contentType: "image/jpeg",
      base64: Buffer.from("nu este o imagine deloc, doar text").toString("base64"),
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.reason).toBe("image_unsupported_format");
  });

  it("decupajul de reîncercare există doar când avem pixeli", () => {
    expect(mrzCropAttachment(null)).toBeNull();
    expect(mrzCropAttachment(raster(1200, 900))?.mimeType).toBe("image/jpeg");
  });
});

describe("citirea zonei automate cu modelul", () => {
  it("liniile brute intră în parserul determinist", async () => {
    const provider = fakeProvider([syntheticMrz()]);
    const prepared = await prepareIdUpload({
      contentType: "image/jpeg",
      base64: jpegBase64(900, 600),
    });
    if (!prepared.ok) throw new Error("pregătire");
    const outcome = await readMrzFromImage(provider, prepared);
    expect(outcome.reading?.ok).toBe(true);
    expect(outcome.reading?.fields.cnp.status).toBe("verified");
    expect(outcome.attempts).toBe(1);
    expect(outcome.usage).toEqual({ calls: 1, inputTokens: 100, outputTokens: 20 });
    expect(provider.attachments).toEqual(["image/jpeg"]);
  });

  it("modelul nu decide validitatea: cifrele de control greșite duc la reîncercare, apoi la cerere de poză nouă", async () => {
    const broken = syntheticMrz().split("\n");
    broken[0] = `${(broken[0] as string).slice(0, 6)}9${(broken[0] as string).slice(7)}`;
    const provider = fakeProvider([broken.join("\n"), broken.join("\n")]);
    const prepared = await prepareIdUpload({
      contentType: "image/jpeg",
      base64: jpegBase64(900, 600),
    });
    if (!prepared.ok) throw new Error("pregătire");
    const outcome = await readMrzFromImage(provider, prepared);
    expect(outcome.attempts).toBe(2);
    expect(outcome.quality).toContain("mrz_unreadable");
    expect(outcome.reading?.ok).toBe(false);
    expect(outcome.usage.calls).toBe(2);
  });

  it("fără zona MRZ în răspuns cere o fotografie mai bună", async () => {
    const provider = fakeProvider(["NONE"]);
    const prepared = await prepareIdUpload({
      contentType: "image/jpeg",
      base64: jpegBase64(900, 600),
    });
    if (!prepared.ok) throw new Error("pregătire");
    const outcome = await readMrzFromImage(provider, prepared);
    expect(outcome.reading).toBeNull();
    expect(outcome.quality).toContain("mrz_not_found");
  });

  it("rândurile tăiate sunt raportate ca tăiate, nu ca lipsă", () => {
    const lines = syntheticMrz()
      .split("\n")
      .map((line) => line.slice(0, 25));
    const candidates = extractMrzCandidates(lines.join("\n"));
    expect(candidates.length).toBe(3);
    expect(mrzTextFromCandidates(candidates)).toBeNull();
    expect(assessMrzCandidates(candidates)).toEqual(["mrz_lines_incomplete"]);
  });
});

describe("fața actului", () => {
  it("toate câmpurile sunt „de confirmat”, cu datele normalizate", async () => {
    const provider = fakeProvider([
      '{"idAddress":"Str. Exemplu 1, București","issuingAuthority":"SPCLEP Exemplu","issuedOn":"12.03.2020","validUntil":"2030-03-12","series":"RX","surname":"POPESCU","givenNames":"ION MARIN","documentNumber":"RX123456"}',
    ]);
    const prepared = await prepareIdUpload({
      contentType: "image/jpeg",
      base64: jpegBase64(900, 600),
    });
    if (!prepared.ok) throw new Error("pregătire");
    const outcome = await readFrontFromImage(provider, prepared);
    for (const field of Object.values(outcome.front.fields)) {
      expect(field.source).toBe("vision");
      expect(field.status).toBe("unverified");
    }
    expect(outcome.front.fields.issuedOn.value).toBe("2020-03-12");
    expect(outcome.usage.calls).toBe(1);
  });

  it("răspuns nefolositor → motiv de recapturare, nu eroare generică", () => {
    const parsed = parseFrontVision("nu pot citi");
    expect(parsed.unreadable).toBe(true);
    expect(parsed.fields.idAddress.value).toBeNull();
  });

  it("datele scrise altfel sunt normalizate sau refuzate", () => {
    expect(normalizeFrontDate("01/02/2031")).toBe("2031-02-01");
    expect(normalizeFrontDate("31.02.2031")).toBeNull();
  });

  it("conflictul față ↔ zona automată este raportat, nu fuzionat", () => {
    const reading = readMrz(syntheticMrz());
    const front = parseFrontVision('{"surname":"IONESCU","documentNumber":"RX123456"}');
    const conflicts = detectFrontConflicts(reading.fields, front.fields);
    expect(conflicts).toEqual([{ field: "surname", mrz: "POPESCU", vision: "IONESCU" }]);
    /* Valoarea din MRZ rămâne neschimbată: nu alegem în silence. */
    expect(reading.fields.surname.value).toBe("POPESCU");
  });

  it("valorile identice nu produc conflict", () => {
    const reading = readMrz(syntheticMrz());
    const front = parseFrontVision('{"surname":"Popescu","givenNames":"Ion Marin"}');
    expect(detectFrontConflicts(reading.fields, front.fields)).toEqual([]);
  });
});

describe("imaginea nu este păstrată nicăieri", () => {
  it("modulele de pe această cale nu folosesc storage, disc sau inserturi", async () => {
    const files = [
      "src/lib/contracts/id/prepare.server.ts",
      "src/lib/contracts/id/vision.server.ts",
      "src/lib/contracts/id/vision.parse.ts",
      "src/lib/contracts/id-document.functions.ts",
    ];
    const { readFile } = await import("node:fs/promises");
    for (const file of files) {
      const source = await readFile(file, "utf8");
      expect(source, file).not.toMatch(/storage\s*\.from|\.upload\(/);
      expect(source, file).not.toMatch(/writeFile|createWriteStream|\/tmp\//);
      expect(source, file).not.toMatch(/console\.(log|error|warn)\([^)]*base64/);
    }
  });
});

describe("citirea actelor prin registry, fără date reale", () => {
  const context = {
    userId: "agent-test",
    supabase: { rpc: async () => ({ data: "agency-test", error: null }) },
  };
  const runHandler = readIdDocument as unknown as (args: {
    context: typeof context;
    data: { back?: { contentType: string; base64: string }; front?: { contentType: string; base64: string } };
  }) => Promise<import("../id-document.functions").IdDocumentReadResult>;
  const image = () => ({ contentType: "image/jpeg", base64: jpegBase64(90, 60) });

  for (const fallback of [false, true]) {
    describe(fallback ? "Gemini rezervă după 529" : "MiniMax principal", () => {
      for (const scenario of ["valid", "crop", "front", "restart"] as const) {
        it(scenario, async () => {
          vi.stubEnv("MINIMAX_API_KEY", "synthetic-key");
          vi.stubEnv("GEMINI_API_KEY", "synthetic-key");
          vi.stubEnv("MINIMAX_MODEL", "MiniMax-M3.1-Flash");
          vi.stubEnv("GEMINI_MODEL", "gemini-fixture");
          const valid = syntheticMrz();
          const broken = valid.split("\n");
          broken[0] = `${(broken[0] as string).slice(0, 6)}9${(broken[0] as string).slice(7)}`;
          const bodies: { minimax: boolean; body: Record<string, unknown> }[] = [];
          let successfulCalls = 0;
          let primaryCalls = 0;
          const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
            const minimax = url.includes("minimax.io");
            const body = JSON.parse(String(init.body));
            bodies.push({ minimax, body });
            if (minimax) primaryCalls += 1;
            if (minimax && fallback && (scenario !== "restart" || primaryCalls > 1)) {
              return new Response("fixture", { status: 529 });
            }
            successfulCalls += 1;
            const frontCall = scenario === "front" || (scenario === "restart" && successfulCalls > (fallback ? 2 : 1));
            const text = frontCall
              ? '{"idAddress":"Adresă exemplu","issuedOn":"12.03.2020","surname":"POPESCU"}'
              : scenario === "crop" && successfulCalls === 1 ? broken.join("\n") : valid;
            return minimax
              ? Response.json({ content: [{ type: "text", text }], usage: { input_tokens: 100, output_tokens: 20 } })
              : Response.json({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 } });
          });
          vi.stubGlobal("fetch", fetchMock);
          const data = scenario === "front" ? { front: image() } : scenario === "restart" ? { back: image(), front: image() } : { back: image() };
          const result = await runHandler({ context, data });
          expect(result.state).toBe("read");
          if (result.state !== "read") throw new Error("Expected synthetic reading");
          if (scenario === "front" || scenario === "restart") {
            expect(result.front?.fields.issuedOn.value).toBe("2020-03-12");
            expect(result.front?.fields.issuedOn.status).toBe("unverified");
          }
          if (scenario !== "front") expect(result.reading.ok).toBe(true);
          const providerBodies = bodies.filter((entry) => entry.minimax === !fallback);
          if (scenario === "crop") {
            expect(providerBodies).toHaveLength(2);
            const base64At = (body: Record<string, unknown>) => fallback
              ? (body.contents as { parts: { inlineData?: { data: string } }[] }[])[0]?.parts[1]?.inlineData?.data
              : (body.messages as { content: { source?: { data: string } }[] }[])[0]?.content[1]?.source?.data;
            const full = base64At(providerBodies[0]?.body ?? {});
            const cropped = base64At(providerBodies[1]?.body ?? {});
            expect(full).toBeTruthy();
            expect(cropped).toBeTruthy();
            expect(cropped).not.toBe(full);
          }
          for (const entry of bodies.filter((item) => item.minimax)) {
            expect((entry.body.messages as { content: unknown[] }[])[0]?.content[1]).toMatchObject({
              type: "image", detail: "high", source: { type: "base64", media_type: "image/jpeg", data: expect.any(String) },
            });
          }
          const calls = scenario === "crop" || scenario === "restart" ? 2 : 1;
          expect(handlerMocks.usage).toHaveBeenCalledTimes(1);
          expect(handlerMocks.usage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            capability: "id_document_vision", provider: fallback ? "gemini" : "minimax",
            model: fallback ? "gemini-fixture" : "MiniMax-M3.1-Flash", fallback_used: fallback,
            input_tokens: calls * 100, output_tokens: calls * 20, tool_calls: calls, success: true,
          }));
          expect(handlerMocks.cap).toHaveBeenCalledTimes(1);
          expect(handlerMocks.cap).toHaveBeenCalledWith("rate_limit_hit", {
            _bucket: "id_document:user:hour:agent-test", _limit: 20, _window_seconds: 3600,
          });
          if (fallback) expect(primaryCalls).toBe(scenario === "restart" ? 4 : 3);
          if (fallback && scenario === "restart") {
            expect(providerBodies).toHaveLength(2);
            expect(providerBodies[0]?.body.systemInstruction).toEqual(bodies[0]?.body.system ? { parts: [{ text: bodies[0]?.body.system }] } : null);
          }
        });
      }
    });
  }

  it("configurarea acceptă MiniMax fără cheie Gemini și niciuna rămâne neconfigurată", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "synthetic-key");
    vi.stubEnv("GEMINI_API_KEY", "");
    const status = getIdReadingStatus as unknown as (args: { context: typeof context }) => Promise<{ configured: boolean }>;
    expect(await status({ context })).toEqual({ configured: true });
    vi.stubEnv("MINIMAX_API_KEY", "");
    expect(await status({ context })).toEqual({ configured: false });
    expect(await runHandler({ context, data: { front: image() } })).toMatchObject({ state: "not_configured" });
    expect(handlerMocks.usage).not.toHaveBeenCalled();
  });

  it("fără cheia MiniMax citește fața prin Gemini și înregistrează rezerva", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "synthetic-key");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      candidates: [{ content: { parts: [{ text: '{"surname":"POPESCU"}' }] } }],
      usageMetadata: { promptTokenCount: 70, candidatesTokenCount: 12 },
    })));
    const result = await runHandler({ context, data: { front: image() } });
    expect(result.state).toBe("read");
    expect(handlerMocks.usage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      provider: "gemini", fallback_used: true, input_tokens: 70, output_tokens: 12,
    }));
  });

  it("eroarea Gemini nu citește și nu loghează răspunsul brut când cererea conține actul", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "synthetic-key");
    const response = new Response("synthetic-sensitive-body", { status: 400 });
    const readBody = vi.spyOn(response, "text");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => response));
    await expect(runHandler({ context, data: { front: image() } })).rejects.toMatchObject({ status: 400 });
    expect(readBody).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join(" ")).not.toContain("synthetic-sensitive-body");
  });
});
