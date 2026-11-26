import type { Tables } from '@/integrations/supabase/types';
import { publicCoords } from '@/lib/geo';
import taxonomy from './reference/investments-taxonomy.json';

export const investmentRequiredLabels: Record<string, string> = {
  'urn:concept:state': 'Stadiu construcție',
  'urn:concept:area-from': 'Suprafață minimă (m²)',
  'urn:concept:area-to': 'Suprafață maximă (m²)',
  'urn:concept:price-per-sq-meter-from': 'Preț minim pe m²',
  'urn:concept:estate-type': 'Tip unități',
  'urn:concept:total-number-of-properties-in-the-investment': 'Număr total unități',
};

export function investmentAttributeFields(d: Tables<'developments'>): Record<string, string | number | null | undefined> {
  const state: Record<string, string> = {'Finalizată':'ready','La cheie':'ready','În construcție':'in-construction','La roșu':'in-construction','Semifinisată':'in-construction','Proiect':'not-started'};
  return {state:state[d.construction_stage??''], 'area-from':d.area_from,'area-to':d.area_to,'price-per-sq-meter-from':d.price_per_sqm_from,'estate-type':d.estate_type,'total-number-of-properties-in-the-investment':d.total_units,'floors-in-building':d.floors_count,'start-date':d.construction_start_date,'end-date':d.delivery_date,'hide-price':d.storia_hide_price?'yes':'no','ceiling-height-from-cm':d.ceiling_height_from_cm,'ceiling-height-to-cm':d.ceiling_height_to_cm,'remote-services':d.remote_services?'yes':null,'net-area-m2':d.net_area_m2,'number-of-rooms':d.number_of_rooms,'on-demand':d.on_demand?'yes':null};
}

export type InvestmentReadinessInput = { imageCount: number; price: number | null; currency: string | null; email: string | null };

/** Preserve the mapper's existing checks: no inferred values or new constraints. */
export function missingInvestmentFields(d: Tables<'developments'>, input: InvestmentReadinessInput): string[] {
  const missing: string[] = [];
  if (!d.name.trim()) missing.push('Nume ansamblu');
  if (!d.description?.trim()) missing.push('Descriere');
  if (!publicCoords(d)) missing.push('Poziția pe hartă');
  if (!input.imageCount) missing.push('Fotografie');
  if (!input.price) missing.push('Preț (din unitățile de vânzare sau «Preț minim — suprascriere»)');
  if (!['RON', 'EUR'].includes(input.currency ?? '')) missing.push('Monedă EUR sau RON');
  if (!input.email) missing.push('Emailul agentului');
  const fields = investmentAttributeFields(d);
  for (const attribute of taxonomy.data[0]?.attributes ?? []) {
    const value = fields[attribute.code.replace('urn:concept:', '')];
    if (attribute.mandatory && (value == null || value === '')) {
      missing.push(investmentRequiredLabels[attribute.code] ?? attribute.code);
    }
  }
  return missing;
}

type SaleUnit = Pick<Tables<'properties'>, 'sale_price' | 'sale_currency' | 'currency' | 'for_sale' | 'status'>;
export function investmentPrice(d: Tables<'developments'>, properties: SaleUnit[]) {
  const active = properties.filter(p => p.status === 'active' && p.for_sale && p.sale_price && p.sale_price > 0);
  const currencies = new Set(active.map(p => p.sale_currency ?? p.currency));
  const price = d.price_from ?? (currencies.size === 1 ? Math.min(...active.map(p => p.sale_price ?? Infinity)) : null);
  return {
    price: Number.isFinite(price) ? price : null,
    currency: d.price_from != null ? d.currency : active[0]?.sale_currency ?? active[0]?.currency ?? null,
  };
}