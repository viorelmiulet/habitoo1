export const AGENCY_QUERIES=['untouched_leads','properties_without_leads'] as const;
export type AgencyQuery=typeof AGENCY_QUERIES[number];
export function agencyQueryFor(text:string):AgencyQuery|null{
  const s=text.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  if(/cine|agent|echip/.test(s) && /lead/.test(s) && /neatins|necontact|nepreluat|fara.*contact/.test(s))return 'untouched_leads';
  if(/anunt|proprietat|oferte/.test(s) && /(?:n.au|nu au|fara).*lead/.test(s) && /luna|aceasta luna/.test(s))return 'properties_without_leads';
  return null;
}
export function canUseAgencyInsights(roles:string[],enabled:boolean):boolean{return enabled && roles.includes('agency_admin');}
export type AgencyInsight={title:string;items:{id:string;label:string;href:string}[];period:string};