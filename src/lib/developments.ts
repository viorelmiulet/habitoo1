import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { MEDIA_BUCKET, signedUrls } from '@/lib/storage';
export type Development = Tables<'developments'>;
export type DevelopmentSummary = { active: number; total: number; price_from: number | null; price_to: number | null; currency: string | null; transaction?: 'sale' | 'rent' };
export const developmentStatusLabels: Record<string,string> = { active: 'Activ', draft: 'Ciornă', archived: 'Arhivat' };
export function developmentHead(title: string, description: string) {
 return { meta: [{ title: `${title} — Habitoo CRM` }, { name: 'description', content: description }, { property: 'og:title', content: `${title} — Habitoo CRM` }, { property: 'og:description', content: description }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex,nofollow' }] };
}
export const developmentsOptions = (orgId?: string) => queryOptions({
 queryKey: ['developments',orgId], queryFn: async () => {
 let q = supabase.from('developments').select('*').is('deleted_at',null).order('name');
 if(orgId) q=q.eq('organization_id',orgId);
 const {data,error}=await q; if(error) throw error; return data ?? [];
 }
});
export const developmentOptions = (id:string) => queryOptions({queryKey:['development',id],queryFn: async () => {
 const {data,error}=await supabase.from('developments').select('*').eq('id',id).is('deleted_at',null).single(); if(error) throw error; return data;
}});
export async function developmentSummary(id:string):Promise<DevelopmentSummary> {
 const {data,error}=await supabase.rpc('development_unit_summary',{_id:id}); if(error) throw error; return data as unknown as DevelopmentSummary;
}
export async function developmentPhotos(id:string) {
 const {data,error}=await supabase.from('development_images').select('*').eq('development_id',id).order('position'); if(error) throw error;
 const urls=await signedUrls(MEDIA_BUCKET,(data??[]).map(x=>x.storage_path));
 return (data??[]).map(x=>({...x,src:urls[x.storage_path]}));
}
