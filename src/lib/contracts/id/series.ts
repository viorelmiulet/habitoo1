/**
 * Seria cărții de identitate: două litere + șase cifre. Perechea de litere este
 * atribuită județului emitent. O pereche necunoscută este avertisment, nu eșec.
 */

export const ID_SERIES_COUNTIES: Record<string, string> = {
  AX: "Alba",
  AR: "Arad",
  AZ: "Arad",
  XC: "Argeș",
  XD: "Argeș",
  XB: "Bacău",
  XT: "Bacău",
  XR: "Bihor",
  XX: "Bihor",
  XZ: "Bistrița-Năsăud",
  XV: "Botoșani",
  ZA: "Brăila",
  ZR: "Brăila",
  ZS: "Brașov",
  ZV: "Brașov",
  ZZ: "Buzău",
  KX: "Caraș-Severin",
  KZ: "Călărași",
  KL: "Cluj",
  KT: "Cluj",
  KV: "Constanța",
  KB: "Constanța",
  KC: "Covasna",
  DX: "Dâmbovița",
  DZ: "Dolj",
  DK: "Dolj",
  GL: "Galați",
  GZ: "Galați",
  GG: "Giurgiu",
  GX: "Gorj",
  HR: "Harghita",
  HD: "Hunedoara",
  HC: "Hunedoara",
  MX: "Ialomița",
  MZ: "Iași",
  NT: "Iași",
  ZG: "Ilfov",
  IZ: "Ilfov",
  MM: "Maramureș",
  MH: "Mehedinți",
  MS: "Mureș",
  NZ: "Neamț",
  OT: "Olt",
  PX: "Prahova",
  PH: "Prahova",
  SZ: "Satu Mare",
  SM: "Satu Mare",
  SB: "Sălaj",
  SX: "Sibiu",
  SV: "Suceava",
  TZ: "Teleorman",
  TM: "Timiș",
  TC: "Tulcea",
  VX: "Vaslui",
  VL: "Vâlcea",
  VN: "Vrancea",
  RD: "București",
  RR: "București",
  RX: "București",
  RK: "București",
  RT: "București",
  RZ: "București",
};

export type SeriesCheck = {
  value: string;
  valid: boolean;
  county: string | null;
  warning: string | null;
  reason: string | null;
};

export function checkIdSeries(raw: string): SeriesCheck {
  const value = raw.replace(/[\s<]/g, "").toUpperCase();
  if (!/^[A-Z]{2}[0-9]{6}$/.test(value)) {
    return { value, valid: false, county: null, warning: null, reason: "series_format" };
  }
  const pair = value.slice(0, 2);
  const county = ID_SERIES_COUNTIES[pair] ?? null;
  return {
    value,
    valid: true,
    county,
    warning: county ? null : "series_pair_unknown",
    reason: null,
  };
}
