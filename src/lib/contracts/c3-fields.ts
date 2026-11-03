import { z } from "zod";
import type { TemplateVars } from "./templates";

const text = z.string().trim().max(300).optional();
export const c3ContractFields = z.object({
  locality: text, copies: z.number().int().min(1).max(100).optional(),
  clientCapacity: z.enum(["vânzător", "cumpărător", "proprietar care închiriază", "chiriaș"]).optional(),
  transactionType: z.enum(["vânzare", "închiriere"]).optional(),
  durationMonths: z.number().int().positive().max(1200).optional(),
  commissionPaymentMoment: text, protectionMonths: z.number().int().nonnegative().max(1200).optional(),
  usePurpose: text, durationText: text, startDate: text, viewingDate: text,
  landBook: text, cadastralNumber: text,
});
export function c3FieldVariables(fields: z.infer<typeof c3ContractFields>): TemplateVars {
  return {
    "contract.localitate": fields.locality, "contract.exemplare": fields.copies,
    "contract.calitate_client": fields.clientCapacity, "contract.tip_tranzactie": fields.transactionType,
    "contract.durata_luni": fields.durationMonths, "contract.moment_plata_comision": fields.commissionPaymentMoment,
    "contract.luni_protectie": fields.protectionMonths, "contract.scop_folosinta": fields.usePurpose,
    "contract.durata_text": fields.durationText, "contract.data_inceput": fields.startDate,
    "contract.data_vizionare": fields.viewingDate, "proprietate.cf": fields.landBook,
    "proprietate.cadastral": fields.cadastralNumber,
  };
}
const documentLabels: Record<string, string> = { ci: "CI", cei: "carte electronică de identitate", pasaport: "pașaport", permis_sedere: "permis de ședere", altul: "alt act" };
export function partyTemplateVariables(prefix: string, party?: {
  fullName: string; cnp?: string; docType?: string; idSeries?: string; idNumber?: string;
  idIssuer?: string; idIssuedOn?: string; address?: string; phone?: string; citizenship?: string;
}): TemplateVars {
  const values = { nume: party?.fullName, cnp: party?.cnp, act_tip: party?.docType ? documentLabels[party.docType] : undefined,
    serie: party?.idSeries, numar: party?.idNumber, emitent: party?.idIssuer,
    data_eliberarii: party?.idIssuedOn, adresa: party?.address, telefon: party?.phone, cetatenie: party?.citizenship };
  return Object.fromEntries(Object.entries(values).map(([key,value]) => [`${prefix}.${key}`,value]));
}