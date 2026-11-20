import type { Tables } from '@/integrations/supabase/types';
import { publicLocation } from '@/lib/geo';
import { feedImageUrl, type FeedImage, type PropertyRow } from './mapper';

export type DevelopmentRow = Tables<'developments'>;
export type DevelopmentImageRow = Tables<'development_images'>;
export type FeedDevelopment = {
  id: string; nume: string; dezvoltator: string | null;
  descriere: { ro: string | null; en: null };
  localitate: string | null; judet: string | null; zona: string | null;
  strada: string | null; numarstradal: string | null;
  latitudine: number | null; longitudine: number | null;
  stadiuconstructie: string | null; data_livrare: string | null;
  nr_cladiri: number | null; nr_etaje: number | null; nr_unitati: number | null;
  facilitati: string[]; pret_de_la: number | null; pret_pana_la: number | null;
  moneda: string | null; images: FeedImage[]; unitati: string[];
  agent_id: string | null; dataadaugare: string; datamodificare: string;
};

/** Automatic prices use only this feed's active units, never private unselected units. */
export function developmentFeedPrices(d: DevelopmentRow, units: PropertyRow[]) {
  const active = units.filter(p => p.status === 'active');
  const sale = active.filter(p => p.for_sale && (p.sale_price ?? 0) > 0);
  const priced = sale.length ? sale.map(p => ({ price: p.sale_price, currency: p.sale_currency ?? p.currency ?? 'EUR' }))
    : active.filter(p => p.for_rent && (p.rent_price ?? 0) > 0).map(p => ({ price: p.rent_price, currency: p.rent_currency ?? p.currency ?? 'EUR' }));
  const currencies = new Set(priced.map(p => p.currency));
  const currency = currencies.size === 1 ? priced[0]?.currency ?? null : null;
  const values = priced.flatMap(p => typeof p.price === 'number' ? [p.price] : []);
  const manual = d.price_from !== null || d.price_to !== null;
  const compatible = !manual || currency === d.currency;
  return {
    from: d.price_from ?? (compatible && currency && values.length ? Math.min(...values) : null),
    to: d.price_to ?? (compatible && currency && values.length ? Math.max(...values) : null),
    currency: manual ? d.currency : currency,
  };
}

export function mapDevelopmentToFeed(d: DevelopmentRow, units: PropertyRow[], images: DevelopmentImageRow[], baseUrl: string): FeedDevelopment {
  const location = publicLocation(d);
  const prices = developmentFeedPrices(d, units);
  return {
    id: d.id, nume: d.name, dezvoltator: d.developer_name,
    descriere: { ro: d.description, en: null },
    localitate: d.city, judet: d.county, zona: d.district,
    strada: location.street, numarstradal: location.street_number,
    latitudine: location.coords?.lat ?? null, longitudine: location.coords?.lng ?? null,
    stadiuconstructie: d.construction_stage, data_livrare: d.delivery_date,
    nr_cladiri: d.buildings_count, nr_etaje: d.floors_count, nr_unitati: d.total_units,
    facilitati: d.amenities ?? [], pret_de_la: prices.from, pret_pana_la: prices.to, moneda: prices.currency,
    images: [...images].sort((a,b) => a.is_primary === b.is_primary ? a.position-b.position : a.is_primary ? -1 : 1).map(i => ({
      src: feedImageUrl(baseUrl,i.id), tip: i.is_primary ? 'principala' : 'galerie', pozitie: i.position,
      modificata: i.updated_at, alt: null, width: i.width, height: i.height,
    })),
    unitati: units.map(p => p.reference ?? p.id), agent_id: d.assigned_to,
    dataadaugare: d.created_at, datamodificare: d.updated_at,
  };
}