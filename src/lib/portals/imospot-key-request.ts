/**
 * Cererea de cheie API către Imospot, trimisă după aprobarea activării.
 * Reguli pure (fără rețea), folosite de server și de teste.
 */
import { z } from "zod";

export const IMOSPOT_PORTAL_ID = "imospot";
export const IMOSPOT_SETTINGS_KEY = "imospot_key_request";
export const IMOSPOT_SETTINGS_URL = "https://crm.habitoo.ro/app/settings?tab=portals";

export const imospotSettingsSchema = z.object({
  to: z.string().trim().email("Destinatar invalid.").max(255),
  from: z.string().trim().email("Expeditor invalid.").max(255),
  cc: z.string().trim().email("Adresa de copie invalidă.").max(255),
});
export type ImospotSettings = z.infer<typeof imospotSettingsSchema>;

export const IMOSPOT_DEFAULT_SETTINGS: ImospotSettings = {
  to: "info@imospot.ro",
  from: "contact@habitoo.ro",
  cc: "contact@habitoo.ro",
};

export function resolveImospotSettings(raw: unknown): ImospotSettings {
  const parsed = imospotSettingsSchema.partial().safeParse(raw ?? {});
  return { ...IMOSPOT_DEFAULT_SETTINGS, ...(parsed.success ? parsed.data : {}) };
}

export type ImospotCompanyData = {
  agencyName: string | null;
  legalName: string | null;
  cui: string | null;
  tradeRegistryNumber: string | null;
  adminName: string | null;
  adminEmail: string | null;
  adminPhone: string | null;
  city: string | null;
  activeListings: number | null;
};

const REQUIRED: { key: keyof ImospotCompanyData; label: string }[] = [
  { key: "legalName", label: "Denumire legală" },
  { key: "cui", label: "CUI" },
  { key: "tradeRegistryNumber", label: "Nr. Registrul Comerțului" },
  { key: "adminEmail", label: "Email administrator" },
  { key: "adminPhone", label: "Telefon administrator" },
];

/** Etichetele câmpurilor obligatorii lipsă, în ordine fixă. */
export function missingImospotFields(d: ImospotCompanyData): string[] {
  return REQUIRED.filter(({ key }) => !String(d[key] ?? "").trim()).map((r) => r.label);
}

export const INCOMPLETE_PREFIX = "Date firmă incomplete: ";

export function buildImospotEmail(d: ImospotCompanyData, s: ImospotSettings) {
  const subject = `Solicitare cheie API Imospot — ${d.legalName} (CUI ${d.cui})`;
  const rows: [string, string][] = [
    ["Denumirea agenției", d.agencyName ?? "—"],
    ["Denumirea legală", d.legalName ?? "—"],
    ["CUI", d.cui ?? "—"],
    ["Nr. înregistrare (Registrul Comerțului)", d.tradeRegistryNumber ?? "—"],
    ["Persoana care administrează contul", d.adminName ?? "—"],
    ["Email administrator", d.adminEmail ?? "—"],
    ["Telefon", d.adminPhone ?? "—"],
    ["Oraș", d.city ?? "—"],
  ];
  if (d.activeListings !== null) rows.push(["Anunțuri active în Habitoo", String(d.activeListings)]);
  rows.push(["Pagina din Habitoo unde se introduce cheia", `${IMOSPOT_SETTINGS_URL} (fila Portaluri, cardul Imospot)`]);

  const intro =
    "Bună ziua,\n\nVă rugăm să creați contul Imospot și să emiteți cheia API pentru agenția de mai jos, partener Habitoo CRM:";
  const outro = [
    "Vă rugăm să trimiteți cheia pe email atât agenției (administratorului de mai sus), cât și integratorului Habitoo (contact@habitoo.ro).",
    "Dacă agenția are deja anunțuri publicate manual pe Imospot, vă va comunica separat perechile „anunț Imospot (link sau cod) → cod Habitoo”.",
    "Mulțumim,\nEchipa Habitoo CRM",
  ];
  const text = `${intro}\n\n${rows.map(([k, v]) => `- ${k}: ${v}`).join("\n")}\n\n${outro.join("\n\n")}\n`;
  const esc = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const html = `<p>${esc(intro).replace(/\n/g, "<br>")}</p><ul>${rows
    .map(([k, v]) => `<li><strong>${esc(k)}:</strong> ${esc(v)}</li>`)
    .join("")}</ul>${outro.map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}`;

  return { from: `Habitoo CRM <${s.from}>`, to: s.to, cc: s.cc, replyTo: d.adminEmail, subject, text, html };
}

export type ImospotEmail = ReturnType<typeof buildImospotEmail>;

export type NotifyRequestRow = {
  id: string;
  organizationId: string;
  portal: string;
  status: string;
  notifyRequired: boolean;
  notifiedAt: string | null;
};

export type NotifyDeps = {
  loadRequest: (id: string) => Promise<NotifyRequestRow | null>;
  loadCompany: (row: NotifyRequestRow) => Promise<ImospotCompanyData>;
  loadSettings: () => Promise<ImospotSettings>;
  send: (email: ImospotEmail) => Promise<{ ok: boolean; error?: string }>;
  save: (id: string, patch: { notifiedAt?: string; error: string | null }) => Promise<void>;
  audit: (row: NotifyRequestRow, values: Record<string, unknown>) => Promise<void>;
  now?: () => string;
};

export type NotifyOutcome =
  | { status: "sent" }
  | { status: "skipped"; reason: "not_applicable" | "already_sent" }
  | { status: "incomplete"; missing: string[] }
  | { status: "failed"; error: string };

/**
 * Trimite cererea o singură dată. `force` (retrimitere deliberată) ignoră doar
 * „deja trimis”; datele incomplete blochează mereu.
 */
export async function notifyImospotForRequest(
  deps: NotifyDeps,
  requestId: string,
  opts: { force?: boolean } = {},
): Promise<NotifyOutcome> {
  const row = await deps.loadRequest(requestId);
  if (!row || row.portal !== IMOSPOT_PORTAL_ID || row.status !== "approved") {
    return { status: "skipped", reason: "not_applicable" };
  }
  if (row.notifiedAt && !opts.force) return { status: "skipped", reason: "already_sent" };

  const company = await deps.loadCompany(row);
  const missing = missingImospotFields(company);
  if (missing.length > 0) {
    await deps.save(row.id, { error: `${INCOMPLETE_PREFIX}${missing.join(", ")}` });
    return { status: "incomplete", missing };
  }

  const settings = await deps.loadSettings();
  const email = buildImospotEmail(company, settings);
  let result: { ok: boolean; error?: string };
  try {
    result = await deps.send(email);
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : "Trimiterea a eșuat." };
  }
  if (!result.ok) {
    const error = `Trimiterea a eșuat: ${result.error ?? "eroare necunoscută"}`.slice(0, 500);
    await deps.save(row.id, { error });
    await deps.audit(row, { success: false, error, to: settings.to, resend: Boolean(opts.force) });
    return { status: "failed", error };
  }
  const at = (deps.now ?? (() => new Date().toISOString()))();
  await deps.save(row.id, { notifiedAt: at, error: null });
  await deps.audit(row, { success: true, to: settings.to, cc: settings.cc, resend: Boolean(opts.force) });
  return { status: "sent" };
}
