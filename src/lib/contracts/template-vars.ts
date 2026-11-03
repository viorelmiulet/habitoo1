import type { z } from "zod";
import { c3FieldVariables, partyTemplateVariables, type c3ContractFields } from "./c3-fields";
import { contractNumberVariables } from "./numbering";
import { viewingTable, type ViewingProperty } from "./viewing-table";
import { propertyTypeLabels } from "@/lib/labels";
import type { TemplateVars } from "./templates";

type Party = {
  role: string; fullName: string; cnp?: string; idSeries?: string; idNumber?: string; idIssuer?: string;
  idIssuedOn?: string; birthDate?: string; address?: string; phone?: string; email?: string;
  citizenship?: string; docType?: string;
};
type Nullable<T> = { [K in keyof T]?: T[K] | null };

/** Shared variable map for generic (template-rendered) contracts; pure so tests use the real mapping. */
export function contractTemplateVars(input: {
  kind: string;
  org?: Nullable<{ name: string; legal_name: string; cui: string; trade_registry_number: string; material_address: string; phone: string; email: string; legal_representative: string }> | null;
  profile?: Nullable<{ full_name: string; phone: string; email: string }> | null;
  property?: Nullable<{ title: string; reference: string; address: string; city: string; county: string; surface: number; rooms: number; price: number; property_type: string }> | null;
  client: Party;
  parties: Party[];
  price: number | null;
  currency: string;
  commission: string | null;
  durationDays?: number;
  durationMonths?: number;
  startDate?: string;
  fields?: z.infer<typeof c3ContractFields>;
  viewingProperties: ViewingProperty[];
}): TemplateVars {
  const { org, profile, property, client, parties } = input;
  return {
    "agentie.denumire": org?.name,
    "agentie.denumire_legala": org?.legal_name,
    "agentie.cui": org?.cui,
    "agentie.registru": org?.trade_registry_number,
    "agentie.adresa": org?.material_address,
    "agentie.telefon": org?.phone,
    "agentie.email": org?.email,
    "agentie.reprezentant": org?.legal_representative,
    "agent.nume": profile?.full_name,
    "agent.telefon": profile?.phone,
    "agent.email": profile?.email,
    "proprietate.titlu": property?.title,
    "proprietate.referinta": property?.reference,
    "proprietate.adresa": input.fields?.propertyAddress || property?.address,
    "proprietate.localitate": property?.city,
    "proprietate.judet": property?.county,
    "proprietate.suprafata": property?.surface,
    "proprietate.camere": property?.rooms,
    "proprietate.pret": property?.price,
    "proprietate.tip": property?.property_type ? propertyTypeLabels[property.property_type] ?? property.property_type : undefined,
    "client.nume": client.fullName,
    "client.cnp": client.cnp,
    "client.serie": client.idSeries,
    "client.numar": client.idNumber,
    "client.emitent": client.idIssuer,
    "client.data_eliberarii": client.idIssuedOn,
    "client.data_nasterii": client.birthDate,
    "client.adresa": client.address,
    "client.telefon": client.phone,
    "client.email": client.email,
    ...contractNumberVariables(input.kind),
    "contract.data": new Date().toLocaleDateString("ro-RO"),
    "contract.pret": input.price ?? "",
    "contract.moneda": input.currency,
    "contract.comision": input.commission ?? "",
    "contract.durata": input.durationDays ?? "",
    ...partyTemplateVariables("client", client),
    ...partyTemplateVariables("comodant", parties.find((p) => p.role === "lender")),
    ...partyTemplateVariables("comodatar", parties.find((p) => p.role === "borrower")),
    ...c3FieldVariables({ ...input.fields, durationMonths: input.fields?.durationMonths ?? input.durationMonths, startDate: input.fields?.startDate ?? input.startDate }),
    "vizionare.tabel": viewingTable(input.viewingProperties),
  };
}

/** Stored identity wins unless the party was scanned in the dialog and will be saved back. */
export function mergeStoredIdentity<P extends { saveIdentity?: boolean }>(
  party: P,
  stored: Record<string, string | undefined> & { docType?: string },
): P {
  if (party.saveIdentity) return party;
  const defined = Object.fromEntries(Object.entries(stored).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  return { ...party, ...defined };
}
