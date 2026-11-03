/**
 * C4 — orchestrarea scanării actului pe server, cu dependențe injectate.
 *
 * Regulă absolută: octeții imaginilor există doar în memorie pe durata cererii.
 * Nu se scriu în storage, în tabele sau în loguri; nu se salvează nicio dată
 * din act aici (salvarea vine doar după „Confirm datele”). Jurnalul de audit
 * primește doar „act scanat” pentru client, fără valori.
 */
import type { AIProvider, AiProviderAttachment } from "@/lib/ai/providers/types";
import {
  CERTIFICATE_PROMPT,
  SCAN_PROMPT,
  buildScanResult,
  parseCertificateAnswer,
  parseScanAnswer,
  type ScanDocType,
  type ScanResult,
} from "./scan";

export const ID_SCAN_PER_HOUR = 30;
/** 10 MB pe imagine (după decodarea base64). */
export const ID_SCAN_MAX_BYTES = 10 * 1024 * 1024;

export type ScanImage = { contentType: string; base64: string };

export type ScanDeps = {
  provider: AIProvider;
  /** Consumă o încercare din plafonul orar; false = limită atinsă. */
  rateLimit: () => Promise<boolean>;
  /** Pregătește imaginea în memorie (decodare, rotire, micșorare). */
  prepare: (image: ScanImage) => Promise<AiProviderAttachment | null>;
  /** Doar acțiunea, fără date din act. */
  audit: (action: "contact_identity.scanned") => Promise<void>;
  usage?: (u: { calls: number; inputTokens: number | null; outputTokens: number | null; success: boolean }) => Promise<void>;
};

export type ScanOutcome =
  | { state: "rate_limited"; message: string }
  | { state: "invalid"; message: string }
  | { state: "read"; result: ScanResult };

export function base64Bytes(base64: string): number {
  const clean = base64.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  const pad = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - pad;
}

export async function runIdentityScan(
  deps: ScanDeps,
  input: { images: ScanImage[]; certificate?: ScanImage | null; docType?: ScanDocType | null },
): Promise<ScanOutcome> {
  const all = [...input.images, ...(input.certificate ? [input.certificate] : [])];
  if (input.images.length === 0 && !input.certificate) return { state: "invalid", message: "Adaugă o fotografie a actului." };
  if (input.images.length > 2) return { state: "invalid", message: "Se acceptă cel mult 2 imagini (față și verso)." };
  if (all.some((i) => base64Bytes(i.base64) > ID_SCAN_MAX_BYTES)) {
    return { state: "invalid", message: "Fiecare imagine poate avea cel mult 10 MB." };
  }
  if (!(await deps.rateLimit())) {
    return { state: "rate_limited", message: `Ai atins limita de ${ID_SCAN_PER_HOUR} scanări pe oră. Încearcă mai târziu.` };
  }

  let calls = 0;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  const track = (r: { inputTokens: number | null; outputTokens: number | null }) => {
    calls += 1;
    if (r.inputTokens !== null) inputTokens = (inputTokens ?? 0) + r.inputTokens;
    if (r.outputTokens !== null) outputTokens = (outputTokens ?? 0) + r.outputTokens;
  };
  let success = false;
  try {
    let answer = parseScanAnswer("");
    if (input.images.length) {
      const attachments: AiProviderAttachment[] = [];
      for (const image of input.images) {
        const prepared = await deps.prepare(image);
        if (!prepared) return { state: "invalid", message: "Imaginea nu poate fi citită. Folosește o poză JPG, PNG, WEBP sau HEIC." };
        attachments.push({ ...prepared, detail: "high" });
      }
      const res = await deps.provider.generate({
        system: SCAN_PROMPT,
        messages: [{ role: "user", content: "Datele actului, în JSON.", attachments }],
        tools: [],
      });
      track(res);
      answer = parseScanAnswer(res.text);
    }
    let certificateAddress: { value: string | null; confidence: number | null } | null = null;
    if (input.certificate) {
      const prepared = await deps.prepare(input.certificate);
      if (!prepared) return { state: "invalid", message: "Certificatul nu poate fi citit. Folosește o imagine sau un PDF." };
      const res = await deps.provider.generate({
        system: CERTIFICATE_PROMPT,
        messages: [{ role: "user", content: "Domiciliul din certificat, în JSON.", attachments: [{ ...prepared, detail: "high" }] }],
        tools: [],
      });
      track(res);
      certificateAddress = parseCertificateAnswer(res.text);
    }
    const result = buildScanResult(answer, { docType: input.docType ?? null, certificateAddress });
    success = true;
    await deps.audit("contact_identity.scanned");
    return { state: "read", result };
  } finally {
    if (deps.usage && calls > 0) await deps.usage({ calls, inputTokens, outputTokens, success }).catch(() => undefined);
  }
}

/* ------------------------------------------------------------ Scope ---- */

export type ScanScope = { organizationId: string; entity: "contact" | "contract_party"; entityId: string | null };

/**
 * C6 — cine poate scana și pe ce agenție se face auditul.
 * Cu `contactId`: aceeași verificare ca pe fișa clientului (admin agenție / agent responsabil).
 * Fără `contactId` (parte necompletată din CRM): orice utilizator autentificat dintr-o agenție.
 * Setarea AI a agenției nu contează.
 */
export async function resolveScanScope(
  contactId: string | null | undefined,
  deps: {
    assertContactAccess: (contactId: string) => Promise<void>;
    contactOrganization: (contactId: string) => Promise<string | null>;
    currentOrganization: () => Promise<string | null>;
  },
): Promise<ScanScope> {
  if (contactId) {
    await deps.assertContactAccess(contactId);
    const org = (await deps.contactOrganization(contactId)) ?? (await deps.currentOrganization());
    if (!org) throw new Error("Agenția nu este configurată.");
    return { organizationId: org, entity: "contact", entityId: contactId };
  }
  const org = await deps.currentOrganization();
  if (!org) throw new Error("Scanarea actului este disponibilă doar membrilor unei agenții.");
  return { organizationId: org, entity: "contract_party", entityId: null };
}

/** Un singur bucket pentru ambele locuri (fișa clientului și „Document nou”). */
export const scanRateBucket = (userId: string) => `contact_identity_scan:user:hour:${userId}`;
