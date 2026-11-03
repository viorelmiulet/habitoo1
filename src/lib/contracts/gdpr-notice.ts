import { renderTemplate, type TemplateVars } from "./templates";

/** C7: GDPR information notice, a template kind that is never a contract kind. */
export const GDPR_NOTICE_KIND = "gdpr_notice" as const;
export const GDPR_NOTICE_KINDS = ["commission", "viewing", "exclusive_representation"] as const;
export const GDPR_NOTICE_INFO = "Se anexează nota de informare GDPR";
export const GDPR_RECEIPT_LINE = "Am primit un exemplar al acestei note.";

export const GDPR_NOTICE_STANDARD_BODY = `NOTĂ DE INFORMARE PRIVIND PRELUCRAREA DATELOR CU CARACTER PERSONAL
Anexă la contractul încheiat la data de {{contract.data}}

1. Operatorul. {{agentie.denumire_legala}}, CUI {{agentie.cui}}, nr. de ordine în Registrul Comerțului {{agentie.registru}}, cu sediul în {{agentie.adresa}}, e-mail {{agentie.email}}, telefon {{agentie.telefon}} („Agenția”).

2. Ce date prelucrăm. Numele și prenumele, CNP-ul, tipul, seria și numărul actului de identitate, emitentul și data eliberării, data nașterii, cetățenia, domiciliul, telefonul și adresa de e-mail.

3. Sursa datelor. Datele provin de la dumneavoastră: din actul de identitate prezentat, din certificatul de atestare a domiciliului, dacă l-ați prezentat, și din informațiile comunicate direct. Dacă actul a fost fotografiat pentru completarea automată a contractului, imaginea este folosită doar pentru extragerea datelor și nu este păstrată.

4. Scopurile și temeiurile prelucrării.
a) încheierea și executarea contractului — art. 6 alin. (1) lit. b) din Regulamentul (UE) 2016/679 („GDPR”);
b) îndeplinirea obligațiilor legale ale Agenției, inclusiv cele contabile și, unde se aplică, cele de cunoaștere a clientelei prevăzute de Legea nr. 129/2019 — art. 6 alin. (1) lit. c) GDPR;
c) constatarea, exercitarea sau apărarea unor drepturi în justiție — art. 6 alin. (1) lit. f) GDPR.
CNP-ul este prelucrat în condițiile art. 4 din Legea nr. 190/2018.

5. Destinatarii datelor. Celelalte părți ale contractului; furnizorii care susțin activitatea Agenției, în calitate de persoane împuternicite (platforma CRM, găzduirea datelor, semnarea electronică, recunoașterea automată a textului din acte); autoritățile publice, atunci când legea o cere. Dacă un furnizor prelucrează date în afara Spațiului Economic European, transferul se face numai cu garanțiile prevăzute de capitolul V GDPR, de exemplu clauze contractuale standard.

6. Durata păstrării. Datele se păstrează pe durata contractului și apoi pe perioada impusă de lege, de regulă 5 ani de la încetarea relației contractuale.

7. Drepturile dumneavoastră. Aveți dreptul de acces, rectificare, ștergere, restricționare a prelucrării, opoziție și portabilitate a datelor, în condițiile GDPR, printr-o cerere trimisă la {{agentie.email}}. Aveți dreptul de a depune plângere la Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (www.dataprotection.ro).

8. Furnizarea datelor. Datele de identificare sunt necesare pentru încheierea contractului; fără ele contractul nu poate fi încheiat. Agenția nu ia decizii bazate exclusiv pe prelucrarea automată a datelor.

Am primit un exemplar al acestei note.`;

type IdParty = { role: string; cnp?: string | null; idSeries?: string | null; idNumber?: string | null };
const filled = (v?: string | null) => typeof v === "string" && v.trim() !== "";

/** Attach only for numbered agency contracts when a non-agent party has ID data. */
export function shouldAttachGdprNotice(kind: string, parties: IdParty[]): boolean {
  if (!(GDPR_NOTICE_KINDS as readonly string[]).includes(kind)) return false;
  return parties.some((p) => p.role !== "agent" && (filled(p.cnp) || filled(p.idSeries) || filled(p.idNumber)));
}

/** Agency template wins over the Habitoo standard. */
export function pickGdprTemplate<T extends { kind: string; organization_id: string | null; is_active?: boolean | null }>(
  templates: T[], orgId: string,
): T | null {
  const active = templates.filter((t) => t.kind === GDPR_NOTICE_KIND && t.is_active !== false);
  return active.find((t) => t.organization_id === orgId) ?? active.find((t) => t.organization_id === null) ?? null;
}

/** Renders the notice without any ID values (CNP, series, number), even if a custom template asks for them. */
export function renderGdprNotice(body: string, vars: TemplateVars): string {
  const safe: TemplateVars = {};
  for (const [key, value] of Object.entries(vars)) {
    if (/\.(cnp|serie|numar)$/.test(key) && !key.startsWith("contract.")) continue;
    safe[key] = value;
  }
  return renderTemplate(body, safe);
}

export type GdprNoticeSnapshot = { body: string; templateId: string | null };

export function readGdprNotice(data: unknown): GdprNoticeSnapshot | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const raw = (data as Record<string, unknown>)["gdprNotice"];
  if (!raw || typeof raw !== "object") return null;
  const body = (raw as Record<string, unknown>)["body"];
  const templateId = (raw as Record<string, unknown>)["templateId"];
  return typeof body === "string" && body.trim() ? { body, templateId: typeof templateId === "string" ? templateId : null } : null;
}

/**
 * Notice used in the PDF. Before signing starts the attach decision is recomputed from the
 * current parties (the saved text is reused); once signing starts the saved notice is frozen.
 */
export function gdprNoticeForDocument(input: {
  kind: string; data: unknown; parties: IdParty[]; signingStarted: boolean;
}): string | null {
  const saved = readGdprNotice(input.data);
  if (!saved) return null;
  if (input.signingStarted) return saved.body;
  return shouldAttachGdprNotice(input.kind, input.parties) ? saved.body : null;
}

/** Natural-person signers of the notice: every party except the agent. */
export const gdprNoticeSigners = <P extends { role: string }>(parties: P[]) => parties.filter((p) => p.role !== "agent");

export type GdprNoticeSaved = GdprNoticeSnapshot & { attached: boolean };

/**
 * Snapshot saved on the contract at creation. Eligible kinds always keep the rendered text
 * (so later template edits never change it); `attached` records whether ID data was present.
 */
export function buildGdprNoticeSnapshot<T extends { id: string; kind: string; organization_id: string | null; is_active?: boolean | null; body: string }>(input: {
  kind: string; parties: IdParty[]; templates: T[]; orgId: string; vars: TemplateVars;
}): GdprNoticeSaved | null {
  if (!(GDPR_NOTICE_KINDS as readonly string[]).includes(input.kind)) return null;
  const template = pickGdprTemplate(input.templates, input.orgId);
  const body = renderGdprNotice(template?.body ?? GDPR_NOTICE_STANDARD_BODY, input.vars);
  return { body, templateId: template?.id ?? null, attached: shouldAttachGdprNotice(input.kind, input.parties) };
}

export function gdprNoticeAttached(data: unknown): string | null {
  const saved = readGdprNotice(data);
  if (!saved) return null;
  const raw = (data as Record<string, unknown>)["gdprNotice"] as Record<string, unknown>;
  return raw["attached"] === false ? null : saved.body;
}
