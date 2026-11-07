import specification from "../../public/dezvoltatori/openapi.json?raw";

export type Schema = {
  $ref?: string; type?: string | string[]; description?: string; properties?: Record<string, Schema>;
  required?: string[]; items?: Schema; oneOf?: Schema[]; anyOf?: Schema[]; enum?: unknown[];
  const?: unknown; example?: unknown; examples?: unknown[]; default?: unknown; format?: string;
  minimum?: number; maximum?: number; minLength?: number; maxLength?: number;
};
type Media = { schema?: Schema; example?: unknown };
export type Parameter = { name: string; in: string; required?: boolean; description?: string; schema: Schema };
export type Operation = { summary: string; description?: string; parameters?: Parameter[]; security?: Record<string, unknown>[];
  requestBody?: { content: Record<string, Media> }; responses: Record<string, { description: string; content?: Record<string, Media>; headers?: Record<string, { schema: Schema }> }>;
  "x-required-scopes"?: string; "x-authentication"?: { description: string };
};
type Specification = { info: { title: string; version: string; description: string }; servers: {url: string; description: string}[];
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema>; securitySchemes: Record<string, { description: string }> };
  "x-code-ambiguities": string[];
  "x-developer-guide": { introduction: string; onboarding: string[]; quickStart: string[]; recommendations: string[];
    history: {version: string; date: string; description: string}[]; contact: string };
};
export const apiSpec: Specification = JSON.parse(specification);
export const operations = Object.entries(apiSpec.paths).flatMap(([path, methods]) => Object.entries(methods)
  .filter(([method]) => ["get", "post", "put", "patch", "delete"].includes(method))
  .map(([method, operation]) => ({ path, method, operation })));
export function resolveSchema(schema: Schema): Schema {
  if (!schema.$ref) return schema;
  return apiSpec.components.schemas[schema.$ref.split("/").at(-1) ?? ""] ?? schema;
}
export function schemaType(input: Schema): string {
  const schema = resolveSchema(input);
  if (schema.oneOf || schema.anyOf) return (schema.oneOf ?? schema.anyOf ?? []).map(schemaType).join(" sau ");
  const type = Array.isArray(schema.type) ? schema.type.join(" | ") : schema.type ?? "object";
  return type === "array" ? `${schemaType(schema.items ?? {})}[]` : type;
}
export function schemaRows(input: Schema, prefix = "", depth = 0): {name: string; schema: Schema; required: boolean}[] {
  const schema = resolveSchema(input);
  if (depth > 8) return [];
  if (schema.oneOf || schema.anyOf) return (schema.oneOf ?? schema.anyOf ?? []).flatMap(s => schemaRows(s, prefix, depth + 1));
  if (schema.items) return schemaRows(schema.items, `${prefix}[]`, depth + 1);
  return Object.entries(schema.properties ?? {}).flatMap(([name, child]) => {
    const key = prefix ? `${prefix}.${name}` : name;
    return [{name: key, schema: resolveSchema(child), required: schema.required?.includes(name) ?? false}, ...schemaRows(child, key, depth + 1)];
  });
}
/** Illustrative values only; the contract supplies types, constants and explicit examples. */
export function schemaExample(input: Schema, name = "", depth = 0): unknown {
  const s = resolveSchema(input);
  if (s.example !== undefined) return s.example;
  if (s.examples?.length) return s.examples[0];
  if (s.const !== undefined) return s.const;
  if (s.enum?.length) return s.enum[0];
  if (s.default !== undefined) return s.default;
  if (depth > 10) return null;
  if (s.oneOf || s.anyOf) return schemaExample((s.oneOf ?? s.anyOf ?? [])[0] ?? {}, name, depth + 1);
  if (s.properties) return Object.fromEntries(Object.entries(s.properties).filter(([key]) => s.required?.includes(key))
    .map(([key, value]) => [key, schemaExample(value, key, depth + 1)]));
  if (s.items) return [schemaExample(s.items, name, depth + 1)];
  if (Array.isArray(s.type) && s.type.includes("null")) return null;
  if (s.type === "null") return null;
  if (s.type === "boolean") return false;
  if (s.type === "integer" || s.type === "number") return s.minimum ?? 1;
  if (s.format === "uuid") return "11111111-1111-4111-8111-111111111111";
  if (s.format === "date-time") return "2026-11-07T06:00:00Z";
  if (s.format === "date") return "2026-11-07";
  if (name === "base_url") return `${apiSpec.servers[0]?.url}/api/public/sites/v1`;
  if (s.format === "uri" || name === "src") return `${apiSpec.servers[0]?.url}/api/public/sites/v1/media/11111111-1111-4111-8111-111111111111`;
  if (name === "idstr" || name === "ref") return "HB-900001";
  if (name === "alias") return "oferta-11111111-1111-4111-8111-111111111111";
  if (name === "id") return "hbEXEMPLE001";
  if (name === "ro") return "Anunț fictiv de integrare";
  return "EXEMPLU_FICTIV";
}
export function requestExample(path: string, method: string, operation: Operation): string {
  let address = path;
  for (const p of operation.parameters ?? []) if (p.in === "path") {
    const value = p.name === "portal" ? p.schema.enum?.[0] : p.name === "indexKey" ? "hbxx_EXEMPLU_INDEX_FICTIV" : p.schema.example ?? "11111111-1111-4111-8111-111111111111";
    address = address.replace(`{${p.name}}`, String(value));
  }
  const query = (operation.parameters ?? []).filter(p => p.in === "query").map(p => {
    const value = p.schema.default ?? p.schema.example ?? (p.name === "w" ? 800 : p.name === "h" ? 600 : undefined);
    return value === undefined ? null : `${p.name}=${encodeURIComponent(String(value))}`;
  }).filter(Boolean).join("&");
  const url = path.startsWith("/api/public/sites/v1/") && operation.security?.length
    ? `$FEED_BASE${address.replace("/api/public/sites/v1", "")}` : `${apiSpec.servers[0]?.url}${address}`;
  const lines = [`curl ${path.includes("/media/") ? "-L " : ""}-X ${method.toUpperCase()} "${url}${query ? `?${query}` : ""}"`];
  if (operation.security?.length) lines.push('  -H "Authorization: Bearer hbxx_EXEMPLU_AGENTIE.SEMNATURA_FICTIVA"');
  const media = operation.requestBody?.content["application/json"];
  if (media) { lines.push('  -H "Content-Type: application/json"'); lines.push(`  --data '${JSON.stringify(media.example ?? schemaExample(media.schema ?? {}), null, 2)}'`); }
  const command = lines.join(" \\\n");
  return url.startsWith("$FEED_BASE") ? `# Folosește feed.base_url din indexul agenției\nFEED_BASE="${apiSpec.servers[0]?.url}/api/public/sites/v1"\n${command}` : command;
}
export function responseExample(operation: Operation): {code: string; format: string; body: string; schema?: Schema} {
  const entry = Object.entries(operation.responses).find(([code]) => code.startsWith("2")) ?? Object.entries(operation.responses)[0];
  if (!entry) return {code: "", format: "", body: ""};
  const [code, response] = entry;
  const [format, media] = Object.entries(response.content ?? {})[0] ?? ["HTTP", undefined];
  const value = media?.example ?? (media?.schema ? schemaExample(media.schema) : undefined);
  return {code, format, schema: media?.schema, body: value === undefined ? `HTTP/1.1 ${code}\nCorp gol — urmează antetul Location (destinație temporară).` : typeof value === "string" ? value : JSON.stringify(value, null, 2)};
}