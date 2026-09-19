/**
 * Traducerea citirii actului în starea formularului de contract — modul pur.
 *
 * Nu conține I/O și nu primește niciodată octeți de imagine: primește doar
 * rezultatul citirii (valori + status per câmp) și spune formularului ce este
 * verificat prin cifre de control, ce trebuie confirmat de om și ce blochează
 * generarea documentului.
 */
import type { IdDocumentReading } from "./read";
import type { IdFieldConflict, IdFrontReading } from "./vision.parse";

/** Câmpurile formularului care pot fi completate din act. */
export type IdFormKey =
  | "fullName"
  | "cnp"
  | "idSeries"
  | "idNumber"
  | "idIssuer"
  | "idIssuedOn"
  | "birthDate"
  | "address";

export const ID_WARNING_MESSAGES: Record<string, string> = {
  document_expired: "Actul este expirat. Verifică valabilitatea înainte de semnare.",
  series_pair_unknown: "Perechea de litere a seriei nu apare în lista județelor cunoscute.",
};

/** Mesajul în română pentru un avertisment al citirii; codul necunoscut trece ca atare. */
export function idWarningMessage(code: string): string {
  return ID_WARNING_MESSAGES[code] ?? code;
}

export type PartyIdState = {
  /** Câmpuri confirmate de cifrele de control. */
  verified: IdFormKey[];
  /** Câmpuri citite de pe fața actului, în așteptarea confirmării umane. */
  pending: IdFormKey[];
  /** Divergențe față/MRZ nerezolvate: fiecare blochează generarea. */
  conflicts: IdFieldConflict[];
  /** Avertismente (act expirat, serie necunoscută) — nu blochează. */
  warnings: string[];
  /** Motivele unei capturi respinse, în română. */
  quality: string[];
};

export const emptyPartyIdState: PartyIdState = {
  verified: [],
  pending: [],
  conflicts: [],
  warnings: [],
  quality: [],
};

/** Data ISO în forma ZZ.LL.AAAA folosită de formular. */
export function isoToRo(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [y, m, d] = value.split("-") as [string, string, string];
  return `${d}.${m}.${y}`;
}

const CONFLICT_LABELS: Record<IdFieldConflict["field"], string> = {
  surname: "Nume",
  givenNames: "Prenume",
  documentNumber: "Număr act",
  series: "Serie act",
};

export function conflictLabel(field: IdFieldConflict["field"]): string {
  return CONFLICT_LABELS[field];
}

export type IdReadingApplied = {
  values: Partial<Record<IdFormKey, string>>;
  state: PartyIdState;
};

/**
 * Aplică o citire reușită: valorile verificate intră direct, cele de pe față
 * intră marcate „de confirmat”, iar conflictele sunt raportate, nu fuzionate.
 */
export function applyIdReading(
  reading: IdDocumentReading,
  front: IdFrontReading | null,
  conflicts: IdFieldConflict[],
  previous: PartyIdState = emptyPartyIdState,
): IdReadingApplied {
  const values: Partial<Record<IdFormKey, string>> = {};
  const verified = new Set<IdFormKey>(previous.verified);
  const pending = new Set<IdFormKey>(previous.pending);

  const name = [reading.fields.surname.value, reading.fields.givenNames.value]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (name && reading.fields.surname.status === "verified") {
    values.fullName = name;
    verified.add("fullName");
    pending.delete("fullName");
  }
  if (reading.fields.cnp.value && reading.fields.cnp.status === "verified") {
    values.cnp = reading.fields.cnp.value;
    verified.add("cnp");
    pending.delete("cnp");
  }
  const series = reading.fields.series.value;
  if (series && reading.fields.series.status === "verified") {
    values.idSeries = series.slice(0, 2);
    values.idNumber = series.slice(2);
    verified.add("idSeries");
    verified.add("idNumber");
    pending.delete("idSeries");
    pending.delete("idNumber");
  }
  const birth = isoToRo(reading.fields.birthDate.value);
  if (birth && reading.fields.birthDate.status === "verified") {
    values.birthDate = birth;
    verified.add("birthDate");
    pending.delete("birthDate");
  }

  if (front) {
    const fromFront: [IdFormKey, string | null][] = [
      ["address", front.fields.idAddress.value],
      ["idIssuer", front.fields.issuingAuthority.value],
      ["idIssuedOn", isoToRo(front.fields.issuedOn.value) || null],
    ];
    for (const [key, value] of fromFront) {
      if (!value) continue;
      if (verified.has(key)) continue;
      values[key] = value;
      pending.add(key);
    }
  }

  return {
    values,
    state: {
      verified: [...verified],
      pending: [...pending],
      conflicts,
      warnings: reading.warnings,
      quality: [],
    },
  };
}

/** Confirmarea explicită a câmpurilor citite de pe fața actului. */
export function confirmPendingFields(state: PartyIdState): PartyIdState {
  return { ...state, pending: [] };
}

/** Alegerea unei valori pentru un conflict îl elimină din listă. */
export function resolveConflict(
  state: PartyIdState,
  field: IdFieldConflict["field"],
): PartyIdState {
  return { ...state, conflicts: state.conflicts.filter((item) => item.field !== field) };
}

/**
 * Motivele pentru care documentul nu poate fi generat încă. Lista goală =
 * generare permisă. Avertismentele nu apar aici, intenționat.
 */
export function idGenerationBlockers(parties: { label: string; state: PartyIdState }[]): string[] {
  const blockers: string[] = [];
  for (const party of parties) {
    if (party.state.conflicts.length > 0) {
      const names = party.state.conflicts.map((item) => conflictLabel(item.field)).join(", ");
      blockers.push(`${party.label}: alege valoarea corectă pentru ${names}.`);
    }
    if (party.state.pending.length > 0) {
      blockers.push(`${party.label}: confirmă datele citite de pe fața actului.`);
    }
  }
  return blockers;
}
