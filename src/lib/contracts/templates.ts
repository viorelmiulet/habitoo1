/**
 * Șabloane de contract: tipuri, catalog de variabile și randare.
 * Modul pur (fără acces la rețea sau la baza de date), testabil unitar.
 */

export const CONTRACT_KINDS = [
  "rent_agreement",
  "exclusive_representation",
  "sale_mandate",
  "rent_mandate",
  "viewing_report",
] as const;
export type ContractKind = (typeof CONTRACT_KINDS)[number];

export const contractKindLabels: Record<string, string> = {
  rent_agreement: "Contract de închiriere",
  exclusive_representation: "Contract de reprezentare exclusivă",
  sale_mandate: "Mandat de vânzare",
  rent_mandate: "Mandat de închiriere",
  viewing_report: "Proces-verbal de vizionare",
};

export const CONTRACT_STATUSES = [
  "draft",
  "pending_signature",
  "partially_signed",
  "signed",
  "cancelled",
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const contractStatusLabels: Record<string, string> = {
  draft: "Ciornă",
  pending_signature: "În așteptare",
  partially_signed: "Parțial semnat",
  signed: "Semnat complet",
  cancelled: "Anulat",
};

export const contractStatusTone: Record<
  string,
  "neutral" | "success" | "warning" | "info" | "danger"
> = {
  draft: "neutral",
  pending_signature: "warning",
  partially_signed: "info",
  signed: "success",
  cancelled: "danger",
};

export const PARTY_ROLES = ["seller", "buyer", "landlord", "tenant", "agent"] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

export const partyRoleLabels: Record<string, string> = {
  seller: "Vânzător / Proprietar",
  buyer: "Cumpărător",
  landlord: "Proprietar",
  tenant: "Chiriaș",
  agent: "Agent",
};

export const INVENTORY_CONDITIONS = ["Foarte buna", "Buna", "Uzata", "Defecta"] as const;
export type InventoryCondition = (typeof INVENTORY_CONDITIONS)[number];
export type InventoryItem = {
  name: string;
  quantity: number;
  condition: InventoryCondition;
  location: string;
  notes: string;
};

export const DEFAULT_INVENTORY_ITEMS: InventoryItem[] = [
  ["Frigider", "Bucatarie"],
  ["Plita incorporabila", "Bucatarie"],
  ["Masina de spalat rufe", "Baie"],
  ["Centrala de apartament", ""],
  ["Canapea extensibila", "Living"],
  ["Pat matrimonial", "Dormitor"],
  ["Dulap haine", "Dormitor"],
  ["Masa bucatarie", "Bucatarie"],
  ["Scaune", "Living"],
  ["Televizor", "Living"],
  ["Comoda TV", "Living"],
  ["Aer conditionat", "Living"],
  ["Cuptor incorporabil", "Bucatarie"],
  ["Cuptor microunde", ""],
].map(([name, location]) => ({ name, quantity: 1, condition: "Buna", location, notes: "" }));

const clean = (value: unknown, blank = "__________") => {
  const text = value === null || value === undefined ? "" : String(value).trim();
  return text && text !== "null" && text !== "undefined" ? text : blank;
};

export type RentalAgreementValues = {
  signingDate?: string | null;
  landlord: Record<string, unknown>;
  tenant: Record<string, unknown>;
  rooms?: string | number | null;
  propertyAddress?: string | null;
  destination?: string | null;
  durationMonths?: string | number | null;
  startDate?: string | null;
  rent?: string | number | null;
  currency?: string | null;
  deposit?: string | number | null;
};

export type ExclusiveRepresentationValues = {
  contractNumber?: string | null;
  signingDate?: string | null;
  agencyLegalName?: string | null;
  agencyAddress?: string | null;
  tradeRegistryNumber?: string | null;
  agencyCui?: string | null;
  legalRepresentative?: string | null;
  legalRepresentativeTitle?: string | null;
  beneficiary: Record<string, unknown>;
  locality?: string | null;
  street?: string | null;
  streetNumber?: string | null;
  county?: string | null;
  rooms?: string | number | null;
  layout?: string | null;
  floor?: string | number | null;
  comfort?: string | null;
  bathrooms?: string | number | null;
  balconies?: string | number | null;
  usableSurface?: string | number | null;
  price?: string | number | null;
  currency?: string | null;
  negotiable?: "DA" | "NU" | string | null;
  commission?: string | number | null;
  durationMonths?: string | number | null;
};

function identityLine(person: Record<string, unknown>) {
  const series = clean(person.idSeries, "");
  const number = clean(person.idNumber);
  return series ? `C.I.: seria ${series} nr. ${number}` : `C.I.: nr. ${number}`;
}

function personBlock(label: string, person: Record<string, unknown>) {
  return `${label}\nNume: ${clean(person.fullName)}\nCNP: ${clean(person.cnp)}\n${identityLine(person)}\nEliberat de: ${clean(person.idIssuer)} la data de ${clean(person.idIssuedOn)}\nDomiciliu: ${clean(person.address)}\nCetatenie: ${clean(person.citizenship)}`;
}

/** Textul juridic furnizat pentru contractul de închiriere, fără titlu și subtitlu. */
export function renderRentalAgreement(values: RentalAgreementValues): string {
  const currency = clean(values.currency);
  return `Incheiat astazi, ${clean(values.signingDate)} intre:\n\n${personBlock("1. PROPRIETAR (LOCATOR):", values.landlord)}\n\n${personBlock("2. CHIRIAS (LOCATAR):", values.tenant)}\n\nI. OBIECTUL CONTRACTULUI\nProprietarul inchiriaza chiriasului imobilul format din ${clean(values.rooms)} camera/camere situat in ${clean(values.propertyAddress)}\n\nII. DESTINATIA\nImobilul va fi folosit de chirias cu destinatia ${clean(values.destination)}. Destinatia spatiului inchiriat nu poate fi schimbata.\n\nIII. DURATA\nAcest contract este incheiat pentru o perioada de ${clean(values.durationMonths)} luni, incepand cu data de ${clean(values.startDate)}.\nCu 30 de zile inaintea expirarii contractului, chiriasul va putea prelungi acest contract pentru aceeasi perioada sau pentru o perioada mai mica, numai cu acordul scris al proprietarului.\n\nIV. CHIRIA SI MODALITATI DE PLATA\nChiria lunara convenita de comun acord este de ${clean(values.rent)} ${currency}/luna.\nGarantia in valoare de ${clean(values.deposit)} ${currency} s-a achitat astazi, la data semnarii contractului de inchiriere.\nGarantia se va restitui in termen de 30 de zile de la incetarea prezentului contract de inchiriere, retinandu-se cheltuielile curente care cad in sarcina chiriasului potrivit prezentului contract.\nNeplata chiriei in termen de 5 zile constituie o incalcare a contractului, proprietarul avand dreptul in acest caz sa rezilieze contractul de inchiriere fara nici o alta formalitate.\n\nV. OBLIGATIILE SI DREPTURILE PROPRIETARULUI\nObligatii: sa predea imobilul in stare buna; sa asigure folosinta imobilului; sa achite taxele legale; sa suporte reparatiile partilor comune.\nDrepturi: sa viziteze imobilul cu anunt prealabil; sa accepte sau sa respinga modificarile propuse; sa verifice platile curente.\n\nVI. OBLIGATIILE SI DREPTURILE CHIRIASULUI\nObligatii: sa foloseasca imobilul conform destinatiei; sa nu subinchirieze; sa achite utilitatile; sa mentina bunurile in buna stare; sa predea spatiul in starea initiala.\nDrepturi: sa utilizeze imobilul in exclusivitate; sa faca imbunatatiri cu acordul proprietarului.\n\nVII. PREDAREA IMOBILULUI\nDupa expirarea contractului chiriasul va preda imobilul in starea in care l-a primit.\n\nVIII. CLAUZA DE FORTA MAJORA\nForta majora, indiferent de natura acesteia, exonereaza de raspundere partea care o invoca.\nPartea care invoca forta majora are obligatia sa comunice celeilalte parti in termen de 5 zile producerea evenimentului.\n\nIX. CONDITIILE DE INCETARE A CONTRACTULUI\n1. la expirarea duratei pentru care a fost incheiat;\n2. in situatia nerespectarii clauzelor contractuale de catre una din parti;\n3. clauza fortei majore;\n4. prin denuntare unilaterala de catre oricare dintre parti, cu o notificare prealabila de 30 de zile.\n\nX. DISPOZITII FINALE\nPrezentul contract reprezinta vointa partilor si inlatura orice intelegere anterioara.\nOrice modificare sau completare a prezentului contract se face numai prin act aditional semnat de ambele parti.\nLitigiile se vor solutiona pe cale amiabila sau, in caz contrar, de instantele judecatoresti competente.`;
}

function beneficiaryIdentity(person: Record<string, unknown>) {
  const series = clean(person.idSeries, "");
  const number = clean(person.idNumber);
  return series ? `posesor al C.I. seria ${series} , nr. ${number}` : `posesor al C.I. nr. ${number}`;
}

/** Textul juridic furnizat pentru contractul de reprezentare exclusivă, fără titlu și subtitlu. */
export function renderExclusiveRepresentation(values: ExclusiveRepresentationValues): string {
  const beneficiary = values.beneficiary;
  return `I. PARTILE CONTRACTANTE

${clean(values.agencyLegalName)}, cu sediul in ${clean(values.agencyAddress)}, inregistrata la registrul comertului sub nr. ${clean(values.tradeRegistryNumber)}, C.U.I. ${clean(values.agencyCui)}, reprezentata prin ${clean(values.legalRepresentative)} in calitate de ${clean(values.legalRepresentativeTitle)}, denumit in continuare PRESTATOR,

si

Domnul(a) ${clean(beneficiary.fullName)}, ${beneficiaryIdentity(beneficiary)}, C.N.P. ${clean(beneficiary.cnp)}, eliberat de ${clean(beneficiary.idIssuer)} la data de ${clean(beneficiary.idIssuedOn)}, avand domiciliul in ${clean(beneficiary.address)}, in calitate de BENEFICIAR.

II. OBIECTUL CONTRACTULUI

1. Beneficiarul acorda Prestatorului dreptul de a realiza conform activitatii sale comerciale curente si pe cheltuiala sa, oricare si toate cercetarile, investigatiile si serviciile de intermediere imobiliara necesare pentru identificarea si selectionarea mai multor oferte de cumparare in favoarea, pentru si in contul Beneficiarului in vederea vanzarii de catre Beneficiar a imobilului situat in loc. ${clean(values.locality)}, str. ${clean(values.street)}, nr. ${clean(values.streetNumber)}, sect/jud. ${clean(values.county)}, nr. camere ${clean(values.rooms)}, ${clean(values.layout)}, etaj ${clean(values.floor)}, confort ${clean(values.comfort)}, nr. bai ${clean(values.bathrooms)}, nr. balcoane ${clean(values.balconies)}, suprafata utila de ${clean(values.usableSurface)} mp.

2. Beneficiarul declara pe propria raspundere ca este proprietarul imobilului de mai sus descris.

3. Beneficiarul contractului se angajeaza sa transmita spre promovare, sa promoveze, respectiv sa vanda imobilul descris mai sus, cu EXCLUSIVITATE acordata Prestatorului. Beneficiarul nu poate promova si vinde proprietatea susmentionata in perioada de exclusivitate nici singur si nici prin alt intermediar, in afara de ${clean(values.agencyLegalName)}.

4. Pretul de vanzare propus: ${clean(values.price)} ${clean(values.currency)}, negociabil ${clean(values.negotiable)}.

III. OBLIGATIILE PRESTATORULUI
• sa realizeze toate demersurile legale necesare promovarii imobilului;
• sa promoveze imobilul pe site-uri de specialitate si retele de socializare;
• sa identifice potentiali cumparatori si sa programeze vizionari;
• sa asiste la negocieri si la incheierea contractului de vanzare.

IV. OBLIGATIILE BENEFICIARULUI
• sa puna la dispozitia Prestatorului documentatia din care rezulta situatia juridica a imobilului ce urmeaza a fi instrainat;
• sa nu trateze direct si nici prin alt intermediar cu ofertantii prezentati de Prestator;
• sa confirme primirea informatiilor de la Prestator, inclusiv prezentarea potentialilor cumparatori, prin semnarea in acest sens a unei scrisori de introducere;
• sa comunice agentiei data si locul incheierii tranzactiei cu cel putin 24 de ore inainte;
• sa achite Prestatorului comisionul conform punctului V.

V. COMISIONUL
1. Comisionul perceput de catre Prestator pentru activitatile realizate este de ${clean(values.commission)}% din valoarea imobilului, fiind datorat de catre Beneficiar.
2. Comisionul va fi platit Prestatorului in baza actului aditional ce se va incheia intre Beneficiar si Prestator la data la care Beneficiarul va semna oricare din conventiile de tipul celor prevazute mai sus si avand ca obiect imobilul.
3. Prestatorul este indreptatit sa incaseze de la Beneficiar comisionul stabilit in prezentul contract inclusiv in situatia in care actul aditional prevazut la art. 2 de la pct. V nu este semnat din culpa exclusiva a Beneficiarului.
4. Beneficiarul va achita comisionul cel tarziu in ziua incheierii tranzactiei.

VI. RASPUNDEREA
1. Comisionul va fi datorat inclusiv in cazul in care Beneficiarul:
• a) instraineaza imobilul catre un client prezentat de Prestator, in mod direct sau printr-o persoana interpusa, fara ca Prestatorul sa fie informat despre intentia Beneficiarului de instrainare a imobilului;
• b) instraineaza imobilul catre un client prezentat de Prestator, in mod direct sau printr-o persoana interpusa prin intermediul unei alte agentii imobiliare sau pe cont propriu.
2. Prestatorul are dreptul sa considere ca prezentul contract a incetat de plin drept, in situatiile de la Punctul VI, art. 1, Beneficiarul avand si obligatia achitarii comisionului.

VII. DURATA SI INCETAREA CONTRACTULUI
1. Prezentul contract intra in vigoare la data semnarii lui de catre parti si este valabil pe o durata de ${clean(values.durationMonths)} luni.
2. Contractul inceteaza prin:
• a) denuntarea unilaterala de catre oricare dintre Parti, cu notificare de 60 de zile inainte;
• b) prin acordul Partilor;
• c) in cazul dizolvarii, lichidarii sau falimentului uneia dintre Partile contractante.

VIII. ALTE CLAUZE
1. Orice intelegere separata realizata intre Beneficiar si angajati sau colaboratori ai Prestatorului, fara acordul in scris al acestuia, este nula.
2. Forta majora exonereaza de raspundere Partile in cazul neexecutarii partiale sau totale a obligatiilor asumate prin prezentul contract.
3. Prezentul contract poate fi modificat doar in scris, printr-un act aditional semnat de catre ambele Parti contractante.`;
}

/** Variabilele disponibile în editorul de șabloane, grupate pentru afișare. */
export const TEMPLATE_VARIABLES: { group: string; items: { key: string; label: string }[] }[] = [
  {
    group: "Agenție",
    items: [
      { key: "agentie.denumire", label: "Denumire comercială" },
      { key: "agentie.denumire_legala", label: "Denumire legală" },
      { key: "agentie.cui", label: "CUI" },
      { key: "agentie.registru", label: "Registrul Comerțului" },
      { key: "agentie.adresa", label: "Adresă sediu" },
      { key: "agentie.telefon", label: "Telefon" },
      { key: "agentie.email", label: "Email" },
      { key: "agent.nume", label: "Agent responsabil" },
      { key: "agent.telefon", label: "Telefon agent" },
      { key: "agent.email", label: "Email agent" },
    ],
  },
  {
    group: "Proprietate",
    items: [
      { key: "proprietate.titlu", label: "Titlu" },
      { key: "proprietate.referinta", label: "Referință" },
      { key: "proprietate.adresa", label: "Adresă" },
      { key: "proprietate.localitate", label: "Localitate" },
      { key: "proprietate.judet", label: "Județ" },
      { key: "proprietate.suprafata", label: "Suprafață" },
      { key: "proprietate.camere", label: "Camere" },
      { key: "proprietate.pret", label: "Preț listat" },
    ],
  },
  {
    group: "Client",
    items: [
      { key: "client.nume", label: "Nume complet" },
      { key: "client.cnp", label: "CNP" },
      { key: "client.serie", label: "Serie act" },
      { key: "client.numar", label: "Număr act" },
      { key: "client.emitent", label: "Emitent act" },
      { key: "client.data_eliberarii", label: "Data eliberării" },
      { key: "client.data_nasterii", label: "Data nașterii" },
      { key: "client.adresa", label: "Adresă / domiciliu" },
      { key: "client.telefon", label: "Telefon" },
      { key: "client.email", label: "Email" },
    ],
  },
  {
    group: "Contract",
    items: [
      { key: "contract.numar", label: "Număr contract" },
      { key: "contract.data", label: "Data contractului" },
      { key: "contract.pret", label: "Preț" },
      { key: "contract.moneda", label: "Monedă" },
      { key: "contract.comision", label: "Comision" },
      { key: "contract.durata", label: "Durată (zile)" },
    ],
  },
];

export type TemplateVars = Record<string, string | number | null | undefined>;

const PLACEHOLDER = /\{\{\s*([a-z0-9_.]+)\s*\}\}/gi;

/**
 * Înlocuiește variabilele `{{grup.cheie}}` din textul șablonului.
 * Variabilele fără valoare devin `__________` pentru completare manuală.
 */
export function renderTemplate(body: string, vars: TemplateVars, blank = "__________"): string {
  return (body ?? "").replace(PLACEHOLDER, (_all, name: string) => {
    const value = vars[name.toLowerCase()];
    if (value === null || value === undefined || String(value).trim() === "") return blank;
    return String(value);
  });
}

/** Lista variabilelor folosite într-un șablon (pentru validare în editor). */
export function templateVariables(body: string): string[] {
  const found = new Set<string>();
  for (const match of (body ?? "").matchAll(PLACEHOLDER)) {
    found.add((match[1] ?? "").toLowerCase());
  }
  return [...found].sort();
}

/** Variabile folosite în șablon dar necunoscute în catalog. */
export function unknownVariables(body: string): string[] {
  const known = new Set(TEMPLATE_VARIABLES.flatMap((g) => g.items.map((i) => i.key)));
  return templateVariables(body).filter((v) => !known.has(v));
}

/** Mască pentru afișarea unui CNP fără a expune valoarea completă. */
export function maskCnp(value: string | null | undefined): string {
  const raw = (value ?? "").replace(/\s+/g, "");
  if (!raw) return "—";
  if (raw.length <= 4) return "•".repeat(raw.length);
  return `${"•".repeat(raw.length - 4)}${raw.slice(-4)}`;
}

/** Validare de bază a CNP-ului românesc (13 cifre + cifră de control). */
export function isValidCnp(value: string | null | undefined): boolean {
  const raw = (value ?? "").replace(/\D/g, "");
  if (raw.length !== 13) return false;
  const weights = [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9];
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(raw[i]) * weights[i]!;
  const rest = sum % 11;
  const control = rest === 10 ? 1 : rest;
  return control === Number(raw[12]);
}
