/** Verificarea feedului XML Kyero: parsare reală și numărarea ofertelor. Pur. */
import { XMLParser, XMLValidator } from "fast-xml-parser";

export type KyeroCheck = { ok: boolean; properties: number; ids: string[]; error: string | null };

export function checkKyeroXml(xml: string): KyeroCheck {
  const valid = XMLValidator.validate(xml);
  if (valid !== true) return { ok: false, properties: 0, ids: [], error: `XML invalid: ${valid.err.msg} (rândul ${valid.err.line})` };
  const doc = new XMLParser({ ignoreAttributes: false, isArray: (name) => name === "property" || name === "image" || name === "feature" }).parse(xml);
  const root = doc?.root;
  if (!root || String(root?.kyero?.feed_version) !== "3") return { ok: false, properties: 0, ids: [], error: "Lipsește <root><kyero><feed_version>3</feed_version>." };
  const props = (root.property ?? []) as Array<{ id: unknown }>;
  return { ok: true, properties: props.length, ids: props.map((p) => String(p.id)), error: null };
}
