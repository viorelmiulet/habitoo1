/**
 * Șabloane de contract: tipuri, catalog de variabile și randare.
 * Modul pur (fără acces la rețea sau la baza de date), testabil unitar.
 */

export const CONTRACT_KINDS = ["sale_mandate", "rent_mandate", "viewing_report"] as const;
export type ContractKind = (typeof CONTRACT_KINDS)[number];

export const contractKindLabels: Record<string, string> = {
  sale_mandate: "Mandat de vânzare",
  rent_mandate: "Mandat de închiriere",
  viewing_report: "Proces-verbal de vizionare",
};

export const CONTRACT_STATUSES = [
  "draft",
  "pending_signature",
  "partially_signed",
  "signed",
  "cancelled",
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const contractStatusLabels: Record<string, string> = {
  draft: "Ciornă",
  pending_signature: "În așteptare",
  partially_signed: "Parțial semnat",
  signed: "Semnat complet",
  cancelled: "Anulat",
};

export const contractStatusTone: Record<
  string,
  "neutral" | "success" | "warning" | "info" | "danger"
> = {
  draft: "neutral",
  pending_signature: "warning",
  partially_signed: "info",
  signed: "success",
  cancelled: "danger",
};

export const PARTY_ROLES = ["seller", "buyer", "landlord", "tenant", "agent"] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

export const partyRoleLabels: Record<string, string> = {
  seller: "Vânzător / Proprietar",
  buyer: "Cumpărător",
  landlord: "Proprietar",
  tenant: "Chiriaș",
  agent: "Agent",
};

/** Variabilele disponibile în editorul de șabloane, grupate pentru afișare. */
export const TEMPLATE_VARIABLES: { group: string; items: { key: string; label: string }[] }[] = [
  {
    group: "Agenție",
    items: [
      { key: "agentie.denumire", label: "Denumire comercială" },
      { key: "agentie.denumire_legala", label: "Denumire legală" },
      { key: "agentie.cui", label: "CUI" },
      { key: "agentie.registru", label: "Registrul Comerțului" },
      { key: "agentie.adresa", label: "Adresă sediu" },
      { key: "agentie.telefon", label: "Telefon" },
      { key: "agentie.email", label: "Email" },
      { key: "agent.nume", label: "Agent responsabil" },
      { key: "agent.telefon", label: "Telefon agent" },
      { key: "agent.email", label: "Email agent" },
    ],
  },
  {
    group: "Proprietate",
    items: [
      { key: "proprietate.titlu", label: "Titlu" },
      { key: "proprietate.referinta", label: "Referință" },
      { key: "proprietate.adresa", label: "Adresă" },
      { key: "proprietate.localitate", label: "Localitate" },
      { key: "proprietate.judet", label: "Județ" },
      { key: "proprietate.suprafata", label: "Suprafață" },
      { key: "proprietate.camere", label: "Camere" },
      { key: "proprietate.pret", label: "Preț listat" },
    ],
  },
  {
    group: "Client",
    items: [
      { key: "client.nume", label: "Nume complet" },
      { key: "client.cnp", label: "CNP" },
      { key: "client.serie", label: "Serie act" },
      { key: "client.numar", label: "Număr act" },
      { key: "client.emitent", label: "Emitent act" },
      { key: "client.data_eliberarii", label: "Data eliberării" },
      { key: "client.data_nasterii", label: "Data nașterii" },
      { key: "client.adresa", label: "Adresă / domiciliu" },
      { key: "client.telefon", label: "Telefon" },
      { key: "client.email", label: "Email" },
    ],
  },
  {
    group: "Contract",
    items: [
      { key: "contract.numar", label: "Număr contract" },
      { key: "contract.data", label: "Data contractului" },
      { key: "contract.pret", label: "Preț" },
      { key: "contract.moneda", label: "Monedă" },
      { key: "contract.comision", label: "Comision" },
      { key: "contract.durata", label: "Durată (zile)" },
    ],
  },
];

export type TemplateVars = Record<string, string | number | null | undefined>;

const PLACEHOLDER = /\{\{\s*([a-z0-9_.]+)\s*\}\}/gi;

/**
 * Înlocuiește variabilele `{{grup.cheie}}` din textul șablonului.
 * Variabilele fără valoare devin `__________` pentru completare manuală.
 */
export function renderTemplate(body: string, vars: TemplateVars, blank = "__________"): string {
  return (body ?? "").replace(PLACEHOLDER, (_all, name: string) => {
    const value = vars[name.toLowerCase()];
    if (value === null || value === undefined || String(value).trim() === "") return blank;
    return String(value);
  });
}

/** Lista variabilelor folosite într-un șablon (pentru validare în editor). */
export function templateVariables(body: string): string[] {
  const found = new Set<string>();
  for (const match of (body ?? "").matchAll(PLACEHOLDER)) {
    found.add((match[1] ?? "").toLowerCase());
  }
  return [...found].sort();
}

/** Variabile folosite în șablon dar necunoscute în catalog. */
export function unknownVariables(body: string): string[] {
  const known = new Set(TEMPLATE_VARIABLES.flatMap((g) => g.items.map((i) => i.key)));
  return templateVariables(body).filter((v) => !known.has(v));
}

/** Mască pentru afișarea unui CNP fără a expune valoarea completă. */
export function maskCnp(value: string | null | undefined): string {
  const raw = (value ?? "").replace(/\s+/g, "");
  if (!raw) return "—";
  if (raw.length <= 4) return "•".repeat(raw.length);
  return `${"•".repeat(raw.length - 4)}${raw.slice(-4)}`;
}

/** Validare de bază a CNP-ului românesc (13 cifre + cifră de control). */
export function isValidCnp(value: string | null | undefined): boolean {
  const raw = (value ?? "").replace(/\D/g, "");
  if (raw.length !== 13) return false;
  const weights = [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9];
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(raw[i]) * weights[i]!;
  const rest = sum % 11;
  const control = rest === 10 ? 1 : rest;
  return control === Number(raw[12]);
}
