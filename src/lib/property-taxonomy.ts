/**
 * Taxonomia de detalii pentru anunțuri, apropiată structural de ImmoFlux
 * (dropdown-uri, radio, grupuri de checkbox), dar cu denumiri text în română.
 * Nu folosim codurile numerice ImmoFlux — doar etichete clare.
 */

export const propertyKindOptions = [
  "Apartament",
  "Garsonieră",
  "Casă",
  "Vilă",
  "Teren",
  "Spațiu comercial",
  "Birou",
  "Hală",
  "Duplex",
  "Penthouse",
] as const;

export const layoutOptions = [
  "Decomandat",
  "Semidecomandat",
  "Nedecomandat",
  "Circular",
  "Vagon",
  "Open space",
] as const;

export const comfortOptions = ["1", "2", "3", "Lux"] as const;

export const destinationOptions = [
  "Rezidențială",
  "Comercială",
  "Birouri",
  "Industrială",
  "Mixtă",
  "Agricolă",
] as const;

export const floorLabelOptions = [
  "Demisol",
  "Parter",
  "Parter înalt",
  "Etaj 1",
  "Etaj 2",
  "Etaj 3",
  "Etaj 4",
  "Etaj 5",
  "Etaj 6",
  "Etaj 7",
  "Etaj 8",
  "Etaj 9",
  "Etaj 10+",
  "Penultimul etaj",
  "Ultimul etaj",
  "Mansardă",
] as const;

export const orientationOptions = [
  "Nord",
  "Sud",
  "Est",
  "Vest",
  "Nord-Est",
  "Nord-Vest",
  "Sud-Est",
  "Sud-Vest",
  "Nord-Sud",
  "Est-Vest",
] as const;

export const constructionStageOptions = [
  "Finalizată",
  "În construcție",
  "La roșu",
  "La cheie",
  "Semifinisată",
  "Proiect",
] as const;

export const buildingTypeOptions = [
  "Bloc",
  "Casă",
  "Vilă",
  "Imobil de birouri",
  "Ansamblu rezidențial",
  "Hală",
] as const;

export const buildingStructureOptions = [
  "Beton",
  "Cărămidă",
  "BCA",
  "Lemn",
  "Metal",
  "Prefabricate",
  "Mixtă",
] as const;

export const seismicRiskOptions = [
  "Fără risc",
  "Risc scăzut",
  "Risc mediu",
  "Risc ridicat",
  "Clasa RsI",
  "Clasa RsII",
  "Clasa RsIII",
  "Clasa RsIV",
  "Expertizat",
  "Neexpertizat",
] as const;

export const heatingOptions = [
  "Termoficare",
  "Centrală proprie",
  "Centrală imobil",
  "Convectoare",
  "Sobă teracotă",
  "Centrală pe lemne",
  "Încălzire pardoseală",
  "Calorifere",
  "Semineu",
  "Pompă de căldură",
] as const;

export const coolingOptions = ["Aer condiționat", "Ventiloconvectoare", "Aeroterme"] as const;

export const utilityOptions = [
  "Curent electric",
  "Apă",
  "Canalizare",
  "Gaz",
  "Puț",
  "Fosă septică",
  "Curent trifazic",
  "CATV",
  "Telefon",
  "Acces internet",
  "Fibră optică",
  "Utilități în zonă",
  "Sistem irigație",
] as const;

export const finishStateOptions = [
  "Finisat",
  "Semifinisat",
  "Ultrafinisat",
  "Bună",
  "Necesită renovare",
  "Renovat",
] as const;

export const insulationOptions = ["Exterior", "Interior", "Bloc izolat termic"] as const;

export const wallFinishOptions = [
  "Vopsea lavabilă",
  "Var",
  "Faianță",
  "Lambriu",
  "Tapet",
  "Marmură",
  "Huma",
  "Vinarom",
] as const;

export const floorFinishOptions = [
  "Parchet",
  "Gresie",
  "Marmură",
  "Mochetă",
  "Dușumea",
  "Linoleum",
  "Nefinisat",
  "Pardoseală flotantă",
] as const;

export const windowOptions = ["PVC", "Lemn", "Aluminiu", "Termopan"] as const;
export const blindOptions = ["Verticale", "Orizontale"] as const;
export const shutterOptions = ["Aluminiu", "Lemn", "PVC"] as const;
export const entryDoorOptions = ["Metal", "Lemn", "PVC", "Pal"] as const;
export const interiorDoorOptions = ["Celulare", "Lemn", "Panel", "PVC", "Sticlă", "Metal"] as const;

export const furnishingOptions = ["Complet", "Parțial", "Nemobilat", "Lux", "Modern"] as const;

export const additionalSpaceOptions = [
  "Terasă",
  "WC serviciu",
  "Boxă la subsol",
  "Debara",
  "Pivniță",
  "Dressing",
] as const;

export const kitchenOptions = [
  "Mobilată",
  "Parțial mobilată",
  "Utilată",
  "Parțial utilată",
  "Nemobilată",
  "Neutilată",
] as const;

export const meteringOptions = [
  "Apometre",
  "Contor căldură",
  "Contor gaz",
  "Contor curent electric",
  "Contorizare separată",
] as const;

export const applianceOptions = [
  "Mașină de spălat rufe",
  "Frigider",
  "Aragaz",
  "Mașină de spălat vase",
  "Fier de călcat",
  "TV",
  "Cafetieră",
  "Uscător păr",
  "Toaster",
  "DVD",
  "Sandwich-maker",
  "Cuptor microunde",
  "Hotă",
  "Robot bucătărie",
  "Aspirator",
  "HI-FI",
  "Plită electrică",
] as const;

export const buildingAmenityOptions = [
  "Interfon",
  "Videointerfon",
  "Supraveghere video",
  "Lift",
  "Spații agrement",
  "Sauna",
  "SPA",
  "Acoperiș",
  "Curte",
  "Curte comună",
  "Grădină",
  "Piscină interioară",
  "Piscină exterioară",
  "Uscătorie",
] as const;

export const streetArrangementOptions = [
  "Asfaltate",
  "Pietruite",
  "Neamenajate",
  "Betonate",
  "Iluminat stradal",
  "Mijloace de transport în comun",
] as const;

export const viewOptions = [
  "Panoramică",
  "Spre lac",
  "Spre mare",
  "Spre munte",
  "Spre oraș",
  "Spre pădure",
] as const;

export const miscFeatureOptions = [
  "Jacuzzi",
  "Scară interioară",
  "Șemineu",
  "Senzor de fum",
  "Sistem de alarmă",
  "Telecomandă poartă garaj",
  "Telecomandă poartă acces auto",
] as const;

export const parkingOptions = [
  "Fără",
  "Loc de parcare",
  "Garaj",
  "Parcare subterană",
  "Parcare supraterană",
] as const;

/** Toate coloanele de tip listă (checkbox multiplu) din formularul de detalii. */
export const PROPERTY_ARRAY_FIELDS = [
  "utilities",
  "heating_systems",
  "cooling_systems",
  "insulation",
  "wall_finishes",
  "floor_finishes",
  "windows",
  "blinds",
  "shutters",
  "entry_door",
  "interior_doors",
  "additional_spaces",
  "kitchen_features",
  "metering",
  "appliances",
  "building_amenities",
  "street_arrangement",
  "views",
  "misc_features",
  "features",
] as const;

export type PropertyArrayField = (typeof PROPERTY_ARRAY_FIELDS)[number];
