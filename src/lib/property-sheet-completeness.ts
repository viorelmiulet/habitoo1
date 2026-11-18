/**
 * Procentul de completare a fișei din lista Proprietăți (antetul fișei).
 * Folosesc aceeași listă de câmpuri esențiale ca recomandarea de pe Acasă.
 */
import { missingEssentials, type RecProperty } from "@/components/app/dashboard/home-recommendations";

const FLOOR_TYPES = new Set(["apartment", "apartament", "studio", "office", "birou", "spatiu_comercial", "commercial"]);

export type SheetInput = Pick<RecProperty, "floor" | "surface" | "rooms" | "features" | "propertyType">;

export function sheetCompleteness(p: SheetInput): number {
  const total = !p.propertyType || FLOOR_TYPES.has(p.propertyType) ? 4 : 3;
  const missing = missingEssentials({ id: "", title: "", ...p, features: p.features ?? [] }).length;
  return Math.round(((total - missing) / total) * 100);
}

export function sheetTone(percent: number): "success" | "ai" | "gold" {
  if (percent >= 90) return "success";
  if (percent >= 70) return "ai";
  return "gold";
}
