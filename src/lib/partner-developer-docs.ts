import raw from './documentation-assets/partner.openapi.json?raw';
import type { Schema, Operation } from './developer-docs';

export const partnerSpec = JSON.parse(raw) as {
  info: {title: string; version: string; description: string};
  servers: {url: string}[];
  paths: Record<string, Record<string, Operation>>;
  components: {schemas: Record<string, Schema>};
  'x-response-notes': string[];
};
export const partnerOperations = Object.entries(partnerSpec.paths).flatMap(([path, methods]) => Object.entries(methods).map(([method, operation]) => ({path, method, operation})));
export const partnerSections = [
  ['introduction','Introducere'],['quickstart','Pornire rapidă'],['keys','Chei și medii'],['authentication','Autentificare'],['limits','Limite de cereri'],['idempotency','Idempotență'],['errors','Erori'],['agencies','Agenții'],['listings','Anunțuri'],['agents','Agenți'],['taxonomies','Liste de valori'],['changes','Flux de modificări'],['webhooks','Webhooks'],['publication','Starea publicării'],['leads','Lead-uri și mesaje'],['stats','Statistici'],['sandbox','Mediul de test'],['checklist','Bune practici și verificare live'],['history','Istoric versiuni'],['contact','Contact'],
] as const;
export function partnerResolve(s: Schema): Schema {return s.$ref ? partnerSpec.components.schemas[s.$ref.split('/').at(-1) ?? ''] ?? s : s;}
export function partnerRows(input: Schema, prefix = '', depth = 0): {name: string; schema: Schema; required: boolean}[] {
  if (depth > 8) return [];
  const s = partnerResolve(input);
  if (s.anyOf || s.oneOf) return (s.anyOf ?? s.oneOf ?? []).flatMap(v => partnerRows(v,prefix,depth+1));
  if (s.items) return partnerRows(s.items,`${prefix}[]`,depth+1);
  return Object.entries(s.properties ?? {}).flatMap(([key,value])=>{const name = prefix ? `${prefix}.${key}` : key;return [{name,schema:partnerResolve(value),required:s.required?.includes(key) ?? false},...partnerRows(value,name,depth+1)];});
}
export function partnerType(input: Schema): string {
  const s = partnerResolve(input);
  if (s.anyOf || s.oneOf) return (s.anyOf ?? s.oneOf ?? []).map(partnerType).join(' | ');
  return s.items ? `${partnerType(s.items)}[]` : Array.isArray(s.type) ? s.type.join(' | ') : s.type ?? 'object';
}
export function partnerCurl(path: string, method: string, operation: Operation): string {
  const address = `${partnerSpec.servers[0]?.url}${path.replace('{id}','11111111-1111-4111-8111-111111111111')}`;
  const params = (operation.parameters ?? []).filter(p=>p.in==='query' && p.schema.default!==undefined).map(p=>`${p.name}=${p.schema.default}`).join('&');
  const lines = [`curl -X ${method.toUpperCase()} "${address}${params?`?${params}`:''}"`, '  -H "Authorization: Bearer $HABITOO_API_KEY"'];
  if (method==='post') lines.push(`  -H \"Idempotency-Key: DEMO-${path.replace(/[^a-z]+/g,'-')}-001\"`);
  if (method==='post'||method==='put') lines.push('  -H "Content-Type: application/json"',`  --data '${JSON.stringify(operation.requestBody?.content['application/json']?.example ?? {},null,2)}'`);
  return lines.join(' \\\n');
}