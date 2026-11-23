import { z } from 'zod';
export type ApproachFacts={title:string|null;city:string|null;area:number|null;rooms:number|null;price:number|null;currency:string|null};
export function approachSentences(f:ApproachFacts,agent:string,agency:string):string[]{
  const detail=[f.title,f.city,f.rooms!==null?`${f.rooms} camere`:null,f.area!==null?`${f.area} m²`:null,f.price!==null && f.currency?`${f.price} ${f.currency}`:null].filter(Boolean).join(' · ');
  return [`Bună ziua! Sunt ${agent}, de la ${agency}.`,`Vă contactez în legătură cu anunțul dumneavoastră: ${detail || 'proprietatea oferită'}.`,'Ați fi disponibil pentru o discuție despre o posibilă colaborare?','Pot să vă prezint modul în care vă putem sprijini în promovarea proprietății, dacă sunteți de acord.'];
}
export function validateApproach(raw:unknown,allowed:string[]):string|null{
  const parsed=z.object({sentences:z.array(z.string()).min(2).max(4)}).strict().safeParse(raw);
  if(!parsed.success || parsed.data.sentences.some(s=>!allowed.includes(s)) || new Set(parsed.data.sentences).size!==parsed.data.sentences.length)return null;
  if(!parsed.data.sentences.includes(allowed[1]??'') || !parsed.data.sentences.some(s=>s===allowed[2] || s===allowed[3]))return null;
  return parsed.data.sentences.join('\n\n');
}