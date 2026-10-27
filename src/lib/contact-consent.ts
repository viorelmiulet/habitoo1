import { z } from 'zod';

export const CONTACT_SOURCES = ['Storia', 'Imobiliare.ro', 'OLX', 'Facebook', 'Anunțuri particulari (MAP)', 'Site-ul agenției', 'Recomandare', 'Telefon', 'Vizită la birou', 'Colaborare'] as const;
export const CONSENT_METHODS = ['verbal', 'scris', 'email', 'formular pe site'] as const;
export type ContactConsentFields = { source: string; gdpr_consent: boolean; gdpr_consent_method: string };
export const EMPTY_CONTACT_CONSENT: ContactConsentFields = { source: '', gdpr_consent: false, gdpr_consent_method: '' };
export function contactConsentPatch(fields: ContactConsentFields) {
  const source = z.string().trim().max(200).parse(fields.source);
  const method = fields.gdpr_consent ? z.enum(CONSENT_METHODS, { message: 'Alege modul în care clientul și-a dat acordul.' }).parse(fields.gdpr_consent_method) : null;
  return { source: source || null, gdpr_consent: fields.gdpr_consent, gdpr_consent_method: method };
}
export type ConsentEvent = { action: 'granted' | 'withdrawn'; at: string; agent_id: string; method: string | null };
export function consentHistory(value: unknown): ConsentEvent[] {
  const result = z.array(z.object({ action: z.enum(['granted', 'withdrawn']), at: z.string(), agent_id: z.string(), method: z.string().nullable() })).safeParse(value);
  return result.success ? result.data : [];
}