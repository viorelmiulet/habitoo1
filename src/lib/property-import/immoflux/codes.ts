/**
 * Dicționarul codurilor IMMOFLUX din `utilities`, `finishes`, `equipment`,
 * `services` și `zone_extra` (documentația IMMOFLUX pentru portaluri).
 * Fiecare cod are eticheta IMMOFLUX și, dacă există, câmpul și opțiunea
 * Habitoo cu același sens (din `property-taxonomy.ts`). `field: null` =
 * fără corespondent în Habitoo → raportat ca nemapat.
 */
import type { PropertyArrayField } from "@/lib/property-taxonomy";

export type ImmofluxCodeField = PropertyArrayField | "finish_state" | "furnishing";

export type ImmofluxCode = {
  label: string;
  field: ImmofluxCodeField | null;
  value: string | null;
};

type Row = [number, string, ImmofluxCodeField | null, string | null];

const NONE = null;

const ROWS: Row[] = [
  // Utilități generale
  [10001, "Curent electric", "utilities", "Curent electric"],
  [10002, "Apă", "utilities", "Apă"],
  [10003, "Canalizare", "utilities", "Canalizare"],
  [10004, "Gaz", "utilities", "Gaz"],
  [10005, "Puț", "utilities", "Puț"],
  [10006, "Fosă septică", "utilities", "Fosă septică"],
  [10007, "Curent trifazic", "utilities", "Curent trifazic"],
  [10009, "CATV", "utilities", "CATV"],
  [10010, "Telefon", "utilities", "Telefon"],
  [10011, "Telefon internațional", NONE, NONE],
  [10014, "Telefon internațional", NONE, NONE],
  [10012, "Acces internet", "utilities", "Acces internet"],
  [10013, "Fibră optică", "utilities", "Fibră optică"],
  [10015, "Utilități în zonă", "utilities", "Utilități în zonă"],
  [10016, "Sistem irigație", "utilities", "Sistem irigație"],
  // Comunicații
  [10050, "Acces internet", "utilities", "Acces internet"],
  [10051, "Fibră optică", "utilities", "Fibră optică"],
  [10052, "Cablu", "utilities", "CATV"],
  [10053, "Wireless", NONE, NONE],
  [10054, "Dial-up", NONE, NONE],
  [10055, "Centrală telefonică", NONE, NONE],
  // Încălzire
  [10101, "Termoficare", "heating_systems", "Termoficare"],
  [10102, "Centrală proprie", "heating_systems", "Centrală proprie"],
  [10103, "Centrală imobil", "heating_systems", "Centrală imobil"],
  [10104, "Convectoare", "heating_systems", "Convectoare"],
  [10105, "Sobă teracotă", "heating_systems", "Sobă teracotă"],
  [10106, "Centrală pe lemne", "heating_systems", "Centrală pe lemne"],
  [10107, "Încălzire pardoseală", "heating_systems", "Încălzire pardoseală"],
  [10108, "Calorifere", "heating_systems", "Calorifere"],
  [10109, "Șemineu", "misc_features", "Șemineu"],
  [10110, "Pompă de căldură", "heating_systems", "Pompă de căldură"],
  // Climatizare
  [10201, "Aer condiționat", "cooling_systems", "Aer condiționat"],
  [10202, "Ventiloconvectoare", "cooling_systems", "Ventiloconvectoare"],
  [10203, "Aeroterme", "cooling_systems", "Aeroterme"],
  [10204, "Climatizare în 2 țevi", NONE, NONE],
  [10205, "Climatizare în 4 țevi", NONE, NONE],
  [10206, "Control individual AC", NONE, NONE],
  [10207, "Aport de aer proaspăt", NONE, NONE],
  [10208, "Centrală de tratare a aerului", NONE, NONE],
  // Teren (Habitoo nu are câmp echivalent)
  [10301, "Oportunitate de investiție", NONE, NONE],
  [10302, "Construcție demolabilă", NONE, NONE],
  [10303, "Parcelabil", NONE, NONE],
  [10304, "La șosea", NONE, NONE],
  [10305, "Acces auto", NONE, NONE],
  [10306, "Teren împrejmuit", NONE, NONE],
  [10307, "Construcție pe teren", NONE, NONE],
  [10308, "CF", NONE, NONE],
  // Izolații
  [20001, "Exterior", "insulation", "Exterior"],
  [20002, "Interior", "insulation", "Interior"],
  [20003, "Bloc izolat termic", "insulation", "Bloc izolat termic"],
  // Pereți
  [20101, "Vopsea lavabilă", "wall_finishes", "Vopsea lavabilă"],
  [20102, "Var", "wall_finishes", "Var"],
  [20103, "Faianță", "wall_finishes", "Faianță"],
  [20104, "Lambriu", "wall_finishes", "Lambriu"],
  [20105, "Tapet", "wall_finishes", "Tapet"],
  [20106, "Marmură", "wall_finishes", "Marmură"],
  [20107, "Humă", "wall_finishes", "Huma"],
  [20108, "Vinarom", "wall_finishes", "Vinarom"],
  [20109, "Stucco veneziano", NONE, NONE],
  // Podele
  [20201, "Parchet", "floor_finishes", "Parchet"],
  [20202, "Gresie", "floor_finishes", "Gresie"],
  [20203, "Marmură", "floor_finishes", "Marmură"],
  [20204, "Mochetă", "floor_finishes", "Mochetă"],
  [20205, "Dușumea", "floor_finishes", "Dușumea"],
  [20206, "Linoleum", "floor_finishes", "Linoleum"],
  [20207, "Nefinisat", "floor_finishes", "Nefinisat"],
  [20208, "Pardoseală flotantă", "floor_finishes", "Pardoseală flotantă"],
  // Stadiu finisaje (o singură valoare)
  [20301, "Finisat", "finish_state", "Finisat"],
  [20302, "Gri", NONE, NONE],
  [20303, "Roșu", NONE, NONE],
  [20304, "Bună", "finish_state", "Bună"],
  [20305, "Necesită renovare", "finish_state", "Necesită renovare"],
  [20306, "Renovat", "finish_state", "Renovat"],
  [20307, "Semifinisat", "finish_state", "Semifinisat"],
  [20308, "Ultrafinisat", "finish_state", "Ultrafinisat"],
  // Ferestre
  [20401, "PVC", "windows", "PVC"],
  [20402, "Lemn", "windows", "Lemn"],
  [20403, "Aluminiu", "windows", "Aluminiu"],
  [20404, "Termopan", "windows", "Termopan"],
  [20405, "Ferestre cu deschidere", NONE, NONE],
  // Jaluzele
  [20501, "Verticale", "blinds", "Verticale"],
  [20502, "Orizontale", "blinds", "Orizontale"],
  // Rulouri
  [20601, "Aluminiu", "shutters", "Aluminiu"],
  [20602, "Lemn", "shutters", "Lemn"],
  [20603, "PVC", "shutters", "PVC"],
  // Ușă intrare
  [20701, "Metal", "entry_door", "Metal"],
  [20702, "Lemn", "entry_door", "Lemn"],
  [20703, "PVC", "entry_door", "PVC"],
  [20704, "PAL", "entry_door", "Pal"],
  // Iluminat (fără opțiuni în Habitoo)
  [20801, "Lămpi", NONE, NONE],
  [20802, "Spoturi", NONE, NONE],
  [20803, "Aplice", NONE, NONE],
  [20804, "Exterior clădire", NONE, NONE],
  [20805, "Lumină naturală", NONE, NONE],
  [20806, "LED", NONE, NONE],
  [20807, "Fluorescent", NONE, NONE],
  // Uși interior
  [20901, "Celulare", "interior_doors", "Celulare"],
  [20902, "Lemn", "interior_doors", "Lemn"],
  [20903, "Panel", "interior_doors", "Panel"],
  [20904, "PVC", "interior_doors", "PVC"],
  [20905, "Sticlă", "interior_doors", "Sticlă"],
  [20906, "Metal", "interior_doors", "Metal"],
  // Acoperiș (fără câmp în Habitoo)
  [21001, "Lindab", NONE, NONE],
  [21002, "Țiglă", NONE, NONE],
  [21003, "Terasă", NONE, NONE],
  [21004, "Tablă", NONE, NONE],
  [21005, "Carton", NONE, NONE],
  [21006, "Șindrilă bituminoasă", NONE, NONE],
  // Spații
  [30001, "Terasă", "additional_spaces", "Terasă"],
  [30002, "WC serviciu", "additional_spaces", "WC serviciu"],
  [30015, "WC serviciu", "additional_spaces", "WC serviciu"],
  [30003, "Boxă la subsol", "additional_spaces", "Boxă la subsol"],
  [30004, "Debara", "additional_spaces", "Debara"],
  [30011, "Pivniță", "additional_spaces", "Pivniță"],
  [30021, "Pivniță", "additional_spaces", "Pivniță"],
  [30012, "Cramă", NONE, NONE],
  [30022, "Cramă", NONE, NONE],
  [30013, "Spațiu depozitare", NONE, NONE],
  [30023, "Spațiu depozitare", NONE, NONE],
  [30014, "Dressing", "additional_spaces", "Dressing"],
  [30016, "Anexe", NONE, NONE],
  [30024, "Anexe", NONE, NONE],
  [30017, "Dependințe", NONE, NONE],
  [30025, "Dependințe", NONE, NONE],
  [30018, "Cameră tehnică", NONE, NONE],
  [30026, "Parcare proprie", NONE, NONE],
  [30027, "Parcare acoperită", NONE, NONE],
  [30028, "Spațiu verde amenajat", NONE, NONE],
  // Bucătărie
  [30101, "Mobilată", "kitchen_features", "Mobilată"],
  [30102, "Parțial mobilată", "kitchen_features", "Parțial mobilată"],
  [30103, "Utilată", "kitchen_features", "Utilată"],
  [30104, "Parțial utilată", "kitchen_features", "Parțial utilată"],
  [30105, "Nemobilată", "kitchen_features", "Nemobilată"],
  [30106, "Neutilată", "kitchen_features", "Neutilată"],
  // Contorizare
  [30201, "Apometre", "metering", "Apometre"],
  [30202, "Contor căldură", "metering", "Contor căldură"],
  [30203, "Contor gaz", "metering", "Contor gaz"],
  [30204, "Contor curent electric", "metering", "Contor curent electric"],
  [30205, "Contorizare separată", "metering", "Contorizare separată"],
  // Mobilat (o singură valoare)
  [30301, "Nemobilat", "furnishing", "Nemobilat"],
  [30302, "Parțial mobilat", "furnishing", "Parțial"],
  [30303, "Complet mobilat", "furnishing", "Complet"],
  [30304, "Mobilat lux", "furnishing", "Lux"],
  [30305, "Modern", "furnishing", "Modern"],
  // Imobil
  [30401, "Interfon", "building_amenities", "Interfon"],
  [30402, "Videointerfon", "building_amenities", "Videointerfon"],
  [30403, "Lift", "building_amenities", "Lift"],
  [30404, "Spații agrement", "building_amenities", "Spații agrement"],
  [30405, "Saună", "building_amenities", "Sauna"],
  [30406, "SPA", "building_amenities", "SPA"],
  [30407, "Acoperiș", "building_amenities", "Acoperiș"],
  [30408, "Curte", "building_amenities", "Curte"],
  [30409, "Curte comună", "building_amenities", "Curte comună"],
  [30410, "Grădină", "building_amenities", "Grădină"],
  [30411, "Piscină interioară", "building_amenities", "Piscină interioară"],
  [30412, "Piscină exterioară", "building_amenities", "Piscină exterioară"],
  [30413, "Uscătorie", "building_amenities", "Uscătorie"],
  [30420, "Recepție", NONE, NONE],
  [30421, "Supraveghere video", "building_amenities", "Supraveghere video"],
  // Imobil comercial (fără opțiuni în Habitoo)
  [30422, "Fațadă cortină de sticlă", NONE, NONE],
  [30423, "Lift cu destinație programată", NONE, NONE],
  [30424, "Fațadă ventilată", NONE, NONE],
  [30426, "BMS", NONE, NONE],
  [30427, "Acces securizat parcare", NONE, NONE],
  [30428, "Semaforizare parcare", NONE, NONE],
  [30429, "Stații încărcare auto electrice", NONE, NONE],
  [30430, "Acces persoane cu dizabilități", NONE, NONE],
  [30431, "Sprinklere", NONE, NONE],
  [30432, "Hidranți interior", NONE, NONE],
  [30433, "Hidranți exterior", NONE, NONE],
  [30434, "Detectoare fum/temperatură", NONE, NONE],
  [30435, "Sistem detecție incendiu", NONE, NONE],
  // Electrocasnice
  [30501, "Fier de călcat", "appliances", "Fier de călcat"],
  [30502, "Cafetieră", "appliances", "Cafetieră"],
  [30503, "Uscător păr", "appliances", "Uscător păr"],
  [30504, "Toaster", "appliances", "Toaster"],
  [30505, "DVD", "appliances", "DVD"],
  [30506, "Mașină de spălat rufe", "appliances", "Mașină de spălat rufe"],
  [30507, "Sandwich-maker", "appliances", "Sandwich-maker"],
  [30508, "Frigider", "appliances", "Frigider"],
  [30509, "Cuptor microunde", "appliances", "Cuptor microunde"],
  [30510, "Aragaz", "appliances", "Aragaz"],
  [30511, "Hotă", "appliances", "Hotă"],
  [30512, "Mașină de spălat vase", "appliances", "Mașină de spălat vase"],
  [30513, "Robot bucătărie", "appliances", "Robot bucătărie"],
  [30514, "Aspirator", "appliances", "Aspirator"],
  [30515, "TV", "appliances", "TV"],
  [30516, "HI-FI", "appliances", "HI-FI"],
  [30517, "Plită electrică", "appliances", "Plită electrică"],
  // Diverse
  [30601, "Jacuzzi", "misc_features", "Jacuzzi"],
  [30602, "Scară interioară", "misc_features", "Scară interioară"],
  [30603, "Șemineu", "misc_features", "Șemineu"],
  [30604, "Senzor de fum", "misc_features", "Senzor de fum"],
  [30605, "Sistem de alarmă", "misc_features", "Sistem de alarmă"],
  [30606, "Telecomandă poartă garaj", "misc_features", "Telecomandă poartă garaj"],
  [30607, "Telecomandă poartă acces auto", "misc_features", "Telecomandă poartă acces auto"],
  // Servicii
  [40001, "Administrare", NONE, NONE],
  [40002, "Pază", NONE, NONE],
  [40003, "Menaj", NONE, NONE],
  [40004, "Supraveghere video", "building_amenities", "Supraveghere video"],
  [40005, "Prosoape", NONE, NONE],
  [40006, "Curățenie", NONE, NONE],
  [40007, "Lenjerie de pat", NONE, NONE],
  [40008, "Transfer aeroport/gară", NONE, NONE],
  [40009, "Tur oraș", NONE, NONE],
  // Străzi
  [50001, "Asfaltate", "street_arrangement", "Asfaltate"],
  [50002, "Pietruite", "street_arrangement", "Pietruite"],
  [50003, "Neamenajate", "street_arrangement", "Neamenajate"],
  [50004, "Betonate", "street_arrangement", "Betonate"],
  [50005, "Iluminat stradal", "street_arrangement", "Iluminat stradal"],
  [50006, "Mijloace de transport în comun", "street_arrangement", "Mijloace de transport în comun"],
  [50007, "De pământ", NONE, NONE],
  // Vedere
  [90001, "Panoramică", "views", "Panoramică"],
  [90002, "Spre lac", "views", "Spre lac"],
  [90003, "Spre mare", "views", "Spre mare"],
  [90004, "Spre munte", "views", "Spre munte"],
  [90005, "Spre oraș", "views", "Spre oraș"],
  [90006, "Spre pădure", "views", "Spre pădure"],
];

export const IMMOFLUX_CODES: ReadonlyMap<number, ImmofluxCode> = new Map(
  ROWS.map(([code, label, field, value]) => [code, { label, field, value }]),
);

/** Acceptă listă de numere/șiruri sau un șir cu coduri separate. */
export function parseImmofluxCodes(value: unknown): number[] {
  const parts: string[] = [];
  const collect = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) parts.push(String(Math.trunc(v)));
    else if (typeof v === "string") parts.push(...(v.match(/\d+/g) ?? []));
    else if (Array.isArray(v)) v.forEach(collect);
  };
  collect(value);
  return parts.map(Number).filter((n) => n > 0);
}
