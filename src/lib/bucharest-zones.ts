// Cartierele mari din București, subzonele lor și vecinătățile evidente.
// Folosit determinist la potrivirea cererilor (fără AI). Pentru o zonă nouă se adaugă doar o intrare.
import { geographyKey } from "./private-listing-geography";

export const BUCHAREST_NEIGHBORHOODS: Record<string, string[]> = {
  // Sector 1
  "Băneasa": ["Pipera", "Aviației", "Băneasa Sisești"],
  "Aviației": ["Pipera", "Aerogării", "Floreasca"],
  "Floreasca": ["Barbu Văcărescu", "Dorobanți", "Primăverii", "Herăstrău"],
  "Dorobanți": ["Kiseleff", "Primăverii", "Aviatorilor", "Domenii"],
  "Domenii": ["Bucureștii Noi", "Damaroaia", "1 Mai", "Ion Mihalache"],
  "Bucureștii Noi": ["Damaroaia", "Chitila", "Străulești", "Laminorului"],
  "Victoriei": ["Gara de Nord", "Romană", "Grivița"],
  // Sector 2
  "Colentina": ["Fundeni", "Andronache", "Doamna Ghica", "Petricani", "Teiul Doamnei"],
  "Pantelimon": ["Delfinului", "Morarilor", "Vergului", "Granitul"],
  "Iancului": ["Mihai Bravu", "Muncii", "Vatra Luminoasă", "Ferdinand"],
  "Tei": ["Lacul Tei", "Barbu Văcărescu", "Ștefan cel Mare", "Obor"],
  "Obor": ["Moșilor", "Ștefan cel Mare", "Iancului"],
  // Sector 3
  "Titan": ["Balta Albă", "Ozana", "Nicolae Grigorescu", "Câțelu", "1 Decembrie 1918", "Parc IOR"],
  "Dristor": ["Râmnicu Sărat", "Baba Novac", "Mihai Bravu"],
  "Vitan": ["Mall Vitan", "Calea Vitan", "Vitan Bârzești"],
  "Unirii": ["Centrul Civic", "Timpuri Noi", "Văcărești"],
  "Dudești": ["Theodor Pallady", "Industriilor"],
  // Sector 4
  "Berceni": ["Oltenița", "Apărătorii Patriei", "Brâncoveanu", "Piața Sudului", "Huedin", "Secuilor", "Constantin Brâncoveanu"],
  "Tineretului": ["Văcărești", "Timpuri Noi", "Văcărești Parc"],
  "Giurgiului": ["Ferentari", "Progresul", "Toporași", "Șincai", "Eroii Revoluției"],
  // Sector 5
  "Rahova": ["Antiaeriană", "Sebastian", "Petre Ispirescu", "Margeanului", "Salaj"],
  "Ferentari": ["Toporași", "Tunari"],
  "Cotroceni": ["13 Septembrie", "Panduri", "Eroilor"],
  // Sector 6
  "Militari": ["Lujerului", "Gorjului", "Apusului", "Uverturii", "Virtuții", "Pacii", "Iuliu Maniu", "Preciziei", "Valea Cascadelor", "Lacul Morii", "Păcii", "Rosu", "Dezrobirii", "Orsova", "Veteranilor"],
  "Drumul Taberei": ["Valea Ialomiței", "Râul Doamnei", "Compozitorilor", "Brâncuși", "Favorit", "Moghioroș", "Romancierilor", "Plaza Romania", "Timișoara"],
  "Crângași": ["Ceahlăul", "Constructorilor", "Răzoare"],
  "Giulești": ["Giulești Sârbi", "Grivița Nouă", "Gării"],
  "Ghencea": ["Ghencea Prelungirea", "Brâncuși"],
  "Grozăvești": ["Regie", "Politehnica"],
};

export const MILITARI_RESIDENCE = "Militari Residence";

/** Perechi de zone vecine evidente (se potrivesc cu scor mai mic). */
export const BUCHAREST_NEIGHBOR_PAIRS: [string, string][] = [
  ["Crângași", "Giulești"], ["Militari", MILITARI_RESIDENCE], ["Militari", "Drumul Taberei"], ["Militari", "Crângași"],
  ["Drumul Taberei", "Ghencea"], ["Drumul Taberei", "Cotroceni"], ["Grozăvești", "Cotroceni"], ["Crângași", "Grozăvești"],
  ["Rahova", "Ferentari"], ["Rahova", "Ghencea"], ["Giurgiului", "Berceni"], ["Berceni", "Tineretului"],
  ["Tineretului", "Unirii"], ["Vitan", "Dristor"], ["Dristor", "Titan"], ["Titan", "Pantelimon"], ["Pantelimon", "Iancului"],
  ["Iancului", "Obor"], ["Obor", "Tei"], ["Tei", "Colentina"], ["Floreasca", "Tei"], ["Floreasca", "Dorobanți"],
  ["Aviației", "Băneasa"], ["Domenii", "Bucureștii Noi"], ["Domenii", "Victoriei"], ["Giulești", "Bucureștii Noi"],
  ["Dudești", "Vitan"], ["Unirii", "Dudești"],
];

const k = geographyKey;
const PARENT = new Map<string, string>();
for (const [parent, subs] of Object.entries(BUCHAREST_NEIGHBORHOODS)) {
  PARENT.set(k(parent), k(parent));
  for (const s of subs) if (!PARENT.has(k(s))) PARENT.set(k(s), k(parent));
}
const NEIGHBORS = new Map<string, Set<string>>();
for (const [a, b] of BUCHAREST_NEIGHBOR_PAIRS) {
  for (const [x, y] of [[k(a), k(b)], [k(b), k(a)]]) {
    if (!NEIGHBORS.has(x)) NEIGHBORS.set(x, new Set());
    NEIGHBORS.get(x)!.add(y);
  }
}

/** Cartierul mare al unei zone (sau zona însăși dacă nu e în listă). */
export function neighborhoodOf(zone: string | null | undefined): string {
  const z = k(zone);
  return PARENT.get(z) ?? z;
}

/** "same" = aceeași zonă sau subzonă↔cartier; "neighbor" = zone vecine; null altfel. */
export function zoneRelation(requestZone: string, propertyZone: string | null | undefined): "same" | "neighbor" | null {
  const a = k(requestZone), b = k(propertyZone);
  if (!a || !b) return null;
  if (a === b) return "same";
  const pa = neighborhoodOf(a), pb = neighborhoodOf(b);
  if (pa === pb) return "same";
  if (NEIGHBORS.get(pa)?.has(pb)) return "neighbor";
  return null;
}
