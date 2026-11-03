import type { PartyRole } from "./templates";

export const C5_KINDS = ["commission", "loan_for_use", "viewing"] as const;
export type C5Kind = (typeof C5_KINDS)[number];
export const isC5Kind = (kind: string): kind is C5Kind => (C5_KINDS as readonly string[]).includes(kind);

export type C5Target = "client" | "lender" | "borrower";
export const C5_PARTY_SLOTS: Record<C5Kind, { target: C5Target; role: PartyRole; label: string }[]> = {
  commission: [{ target: "client", role: "client", label: "Client" }],
  loan_for_use: [
    { target: "lender", role: "lender", label: "Comodant" },
    { target: "borrower", role: "borrower", label: "Comodatar" },
  ],
  viewing: [{ target: "client", role: "client", label: "Client" }],
};

export const CLIENT_CAPACITIES = ["vânzător", "cumpărător", "proprietar care închiriază", "chiriaș"] as const;
export const TRANSACTION_TYPES = ["vânzare", "închiriere"] as const;
export const COMMISSION_PAYMENT_MOMENTS = [
  "semnarea antecontractului",
  "semnarea contractului de vânzare",
  "semnarea contractului de închiriere",
] as const;
export const USE_PURPOSES = ["locuință", "sediu social", "punct de lucru"] as const;

export type C5Form = {
  locality: string;
  copies: string;
  clientCapacity: (typeof CLIENT_CAPACITIES)[number];
  transactionType: (typeof TRANSACTION_TYPES)[number];
  commission: string;
  durationMonths: string;
  paymentMoment: (typeof COMMISSION_PAYMENT_MOMENTS)[number];
  protectionMonths: string;
  propertyAddress: string;
  landBook: string;
  cadastralNumber: string;
  usePurpose: (typeof USE_PURPOSES)[number];
  loanIndefinite: boolean;
  loanMonths: string;
  startDate: string;
  viewingDate: string;
  viewingPropertyIds: string[];
};

export const todayRo = (now = new Date()) => now.toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric" });

export function defaultC5Form(agencyCity?: string | null, now = new Date()): C5Form {
  return {
    locality: agencyCity ?? "",
    copies: "2",
    clientCapacity: "vânzător",
    transactionType: "vânzare",
    commission: "",
    durationMonths: "6",
    paymentMoment: "semnarea antecontractului",
    protectionMonths: "12",
    propertyAddress: "",
    landBook: "",
    cadastralNumber: "",
    usePurpose: "locuință",
    loanIndefinite: false,
    loanMonths: "12",
    startDate: "",
    viewingDate: todayRo(now),
    viewingPropertyIds: [],
  };
}

/** Commission text prefilled from the property: "3% + TVA din prețul de vânzare". */
export function commissionText(raw: string | null | undefined, transaction: string): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  if (/[a-zăâîșț]/i.test(value)) return value;
  const percent = value.endsWith("%") ? value : `${value}%`;
  return `${percent} + TVA din prețul de ${transaction === "închiriere" ? "închiriere" : "vânzare"}`;
}

const int = (value: string) => {
  const n = Number(value.replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Pure builder for the createContract payload of the three C5 kinds. */
export function buildC5Request<P extends { role: PartyRole; fullName: string }>(
  kind: C5Kind,
  form: C5Form,
  parties: Partial<Record<C5Target, P>>,
  agentParty: P,
) {
  const slotParties = C5_PARTY_SLOTS[kind].map((slot) => {
    const party = parties[slot.target];
    if (!party || party.fullName.trim().length < 3) throw new Error(`Completează numele pentru ${slot.label}.`);
    return { ...party, role: slot.role };
  });
  if (kind === "viewing" && form.viewingPropertyIds.length < 1)
    throw new Error("Alege cel puțin un imobil vizionat.");
  const common = { locality: form.locality.trim() || undefined, copies: int(form.copies) ?? 2 };
  const fields =
    kind === "commission"
      ? { ...common, clientCapacity: form.clientCapacity, transactionType: form.transactionType,
          durationMonths: int(form.durationMonths) ?? 6, commissionPaymentMoment: form.paymentMoment,
          protectionMonths: int(form.protectionMonths) ?? 12 }
      : kind === "loan_for_use"
        ? { ...common, propertyAddress: form.propertyAddress.trim() || undefined,
            landBook: form.landBook.trim() || undefined, cadastralNumber: form.cadastralNumber.trim() || undefined,
            usePurpose: form.usePurpose,
            durationText: form.loanIndefinite ? "pe durată nedeterminată" : `pe ${int(form.loanMonths) ?? 12} luni`,
            startDate: form.startDate.trim() || undefined }
        : { ...common, viewingDate: form.viewingDate.trim() || undefined, transactionType: form.transactionType,
            protectionMonths: int(form.protectionMonths) ?? 12 };
  return {
    kind,
    fields,
    commission: kind === "loan_for_use" ? undefined : form.commission.trim() || undefined,
    viewingPropertyIds: kind === "viewing" ? [...new Set(form.viewingPropertyIds)] : undefined,
    parties: kind === "loan_for_use" ? slotParties : [agentParty, ...slotParties],
  };
}
