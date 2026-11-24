/** HomeZZ standard areas, valid in every locality. */
export const HOMEZZ_STANDARD_AREAS = [
  { id: 1, name: "Central" },
  { id: 2, name: "Est" },
  { id: 3, name: "Nord" },
  { id: 4, name: "Nord-Est" },
  { id: 5, name: "Nord-Vest" },
  { id: 6, name: "Periferie" },
  { id: 7, name: "Sud" },
  { id: 8, name: "Sud-Est" },
  { id: 9, name: "Sud-Vest" },
  { id: 10, name: "Ultracentral" },
  { id: 11, name: "Vest" },
] as const;

export const HOMEZZ_AREA_CENTRAL = 1;
/** Clockwise from North, 45° sectors. Periferie/Ultracentral are never computed. */
export const HOMEZZ_DIRECTION_AREAS = [3, 4, 2, 8, 7, 9, 11, 5] as const;
