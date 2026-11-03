export const NUMBERED_CONTRACT_KINDS = ["commission", "viewing", "exclusive_representation"] as const;
export type NumberedContractKind = (typeof NUMBERED_CONTRACT_KINDS)[number];

export function printedContractNumber(series: string | null | undefined, number: number | null | undefined): string {
  return number == null ? "" : `${series?.trim() ? `seria ${series.trim()} ` : ""}nr. ${number}`;
}

export function contractNumberVariables(kind: string) {
  const numbered = NUMBERED_CONTRACT_KINDS.some((value) => value === kind);
  return {
    "contract.serie": numbered ? "{{contract.serie}}" : "",
    "contract.numar": numbered ? "{{contract.numar}}" : "",
    "contract.serie_numar": numbered ? "{{contract.serie_numar}}" : "",
    "contract.numar_intern": "{{contract.numar_intern}}",
  };
}

/** Internal identifiers are never part of the exported document. */
export function documentText(value: string, internalNumber: string | null | undefined): string {
  return internalNumber ? value.split(internalNumber).join("") : value;
}