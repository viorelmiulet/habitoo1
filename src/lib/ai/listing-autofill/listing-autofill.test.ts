import { describe, expect, it, vi } from "vitest";

const features: { organization_id: string; feature_key: string; enabled: boolean }[] = [];
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => ({
        eq: (_c: string, id: string) =>
          table === "organizations"
            ? { maybeSingle: async () => ({ data: { ai_enabled: true, status: "active" }, error: null }) }
            : Promise.resolve({ data: features.filter((f) => f.organization_id === id), error: null }),
      }),
    }),
  },
}));

import type { AIProvider } from "@/lib/ai/providers/types";
import { AiProviderError } from "@/lib/ai/providers/types";
import { runListingAutofill } from "./autofill.server";
import { executeListingAutofill } from "./charge.server";
import { AUTOFILL_INVALID_MESSAGE, onlyEmptyFields, sanitizeAutofillResponse } from "./schema";
import { applyAutofillProposal } from "@/components/app/ai/listing-autofill-apply";
import { emptyTransaction } from "@/components/app/PropertyTransactionFields";
import { isAiFeatureEnabled } from "@/lib/ai/features/features.server";

const img = { mimeType: "image/jpeg", base64: "AAAA" };
function fakeGemini(response: unknown): AIProvider & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    id: "gemini", model: "gemini-standard", supportsTools: true, calls,
    generate: async (req) => { calls.push(req); return { text: typeof response === "string" ? response : JSON.stringify(response), toolCalls: [], inputTokens: 1, outputTokens: 1 }; },
  };
}

describe("Anunț din poze și voce", () => {
  it("poze + voce „2 camere, 75.000 euro, etaj 3” → camere, preț și etaj; finisaje doar din nomenclator", async () => {
    const provider = fakeGemini({
      transcript: "Apartament 2 camere, 75.000 euro, etaj 3",
      fields: [
        { key: "rooms", value: 2, confidence: "high", source: "spoken" },
        { key: "price", value: 75000, confidence: "high", source: "spoken" },
        { key: "floor_label", value: "Etaj 3", confidence: "high", source: "spoken" },
        { key: "floor", value: 3, confidence: "high", source: "spoken" },
        { key: "floor_finishes", value: ["Parchet", "Plută aurie"], confidence: "high", source: "photos" },
      ],
      title: null, description: null, photo_order: [1, 0],
    });
    const result = await runListingAutofill(provider, { images: [img, img], audio: { mimeType: "audio/webm", base64: "AAAA" }, text: "" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.values).toMatchObject({ rooms: 2, price: 75000, floor_label: "Etaj 3", floor: 3, floor_finishes: ["Parchet"] });
    expect(result.proposal.photoOrder).toEqual([1, 0]);
    const req = provider.calls[0] as { messages: { attachments: { mimeType: string }[] }[] };
    expect(req.messages[0]!.attachments.map((a) => a.mimeType)).toEqual(["image/jpeg", "image/jpeg", "audio/webm"]);
  });

  it("doar poze, fără voce → prețul și adresa rămân goale", () => {
    const proposal = sanitizeAutofillResponse({
      transcript: null,
      fields: [
        { key: "price", value: 90000, confidence: "high", source: "photos" },
        { key: "address", value: "Str. Exemplu 1", confidence: "high", source: "spoken" },
        { key: "usable_surface", value: 60, confidence: "medium", source: "photos" },
        { key: "furnishing", value: "Complet", confidence: "high", source: "photos" },
      ],
    }, { spokenText: "", photoCount: 3 });
    expect(proposal?.values["price"]).toBeUndefined();
    expect(proposal?.values["address"]).toBeUndefined();
    expect(proposal?.values["usable_surface"]).toBeUndefined();
    expect(proposal?.values["furnishing"]).toBe("Complet");
  });

  it("valoare din afara nomenclatorului sau încredere scăzută → ignorată", () => {
    const proposal = sanitizeAutofillResponse({
      fields: [
        { key: "furnishing", value: "Super lux", confidence: "high", source: "photos" },
        { key: "property_type", value: "castle", confidence: "high", source: "photos" },
        { key: "secret_field", value: "x", confidence: "high", source: "photos" },
        { key: "finish_state", value: "Nou", confidence: "low", source: "photos" },
      ],
    }, { spokenText: "", photoCount: 1 });
    expect(proposal?.values).toEqual({});
  });

  it("în editare, câmpurile deja completate nu se suprascriu", () => {
    const proposal = sanitizeAutofillResponse({
      fields: [
        { key: "rooms", value: 2, confidence: "high", source: "spoken" },
        { key: "bathrooms", value: 1, confidence: "high", source: "spoken" },
        { key: "price", value: 75000, confidence: "high", source: "spoken" },
      ],
      title: "Apartament 2 camere",
    }, { spokenText: "2 camere, 1 baie, 75000 euro", photoCount: 0 })!;
    const filtered = onlyEmptyFields(proposal, { rooms: 3, bathrooms: null, price: 80000, title: "Titlul meu" });
    expect(filtered.values).toEqual({ bathrooms: 1 });
    expect(filtered.title).toBeNull();

    let details: Record<string, unknown> = { rooms: 3 };
    let tx = { ...emptyTransaction, sale_price: 80000 };
    applyAutofillProposal(proposal, {
      setDetails: (fn) => { details = fn(details); },
      setText: () => undefined,
      setTx: (fn) => { tx = fn(tx); },
    }, { rooms: 3, price: 80000, title: "Titlul meu", transaction: "set" });
    expect(details["rooms"]).toBe(3);
    expect(details["bathrooms"]).toBe(1);
    expect(tx.sale_price).toBe(80000);
  });

  it("credite: rezervate la apel, consumate la succes, restituite la eșec sau răspuns invalid", async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const client = { rpc: async (name: string, args: Record<string, unknown> = {}) => { calls.push({ name, args }); return { data: "res-1", error: null }; } };
    const actor = { organizationId: "org", userId: "u" };

    const ok = await executeListingAutofill(actor, fakeGemini({ fields: [] }), { images: [img], audio: null, text: "" }, { client, recordUsage: false });
    expect(ok.ok).toBe(true);
    expect(calls[0]).toMatchObject({ name: "ai_credit_reserve", args: { p_action: "listing_autofill" } });
    expect(calls[1]).toMatchObject({ name: "ai_credit_settle", args: { p_success: true } });

    calls.length = 0;
    const bad = await executeListingAutofill(actor, fakeGemini("nu e json"), { images: [img], audio: null, text: "" }, { client, recordUsage: false });
    expect(bad).toEqual({ ok: false, message: AUTOFILL_INVALID_MESSAGE });
    expect(calls[1]).toMatchObject({ name: "ai_credit_settle", args: { p_success: false } });

    calls.length = 0;
    const failing: AIProvider = { id: "gemini", model: "m", supportsTools: true, generate: async () => { throw new AiProviderError("down", 400, false); } };
    await expect(executeListingAutofill(actor, failing, { images: [img], audio: null, text: "" }, { client, recordUsage: false })).rejects.toThrow();
    expect(calls[1]).toMatchObject({ name: "ai_credit_settle", args: { p_success: false } });
  });

  it("credite epuizate → mesajul de credite, fără apel la model", async () => {
    const client = { rpc: async () => ({ data: null, error: { message: "ai_credits_exhausted:300:300:2026-12-01" } }) };
    const provider = fakeGemini({ fields: [] });
    await expect(executeListingAutofill({ organizationId: "o", userId: "u" }, provider, { images: [img], audio: null, text: "" }, { client, recordUsage: false }))
      .rejects.toThrow(/Ai folosit creditele AI incluse luna aceasta \(300\/300\)/);
    expect(provider.calls).toHaveLength(0);
  });

  it("funcția pornită implicit și blocată pe server când e oprită", async () => {
    features.length = 0;
    expect(await isAiFeatureEnabled("org-a", "ai_listing_autofill")).toBe(true);
    features.push({ organization_id: "org-a", feature_key: "ai_listing_autofill", enabled: false });
    expect(await isAiFeatureEnabled("org-a", "ai_listing_autofill")).toBe(false);
  });
});
