/**
 * Demonstrative data for the public site mockups.
 * Everything here is fictional and is never read from the database.
 */
import bedroom from "@/assets/mock/bedroom.jpg";
import exterior from "@/assets/mock/exterior.jpg";
import kitchen from "@/assets/mock/kitchen.jpg";
import living from "@/assets/mock/living.jpg";

export const mockPhotos = { living, kitchen, bedroom, exterior };

export const mockProperty = {
  reference: "RF-1024",
  title: "Apartament 3 camere, Aviației",
  city: "București",
  district: "Aviației",
  price: 158_000,
  currency: "EUR",
  transaction: "sale" as const,
  status: "active" as const,
  rooms: 3,
  surface: 78,
  floor: "4 / 8",
  year: 2019,
  features: ["Parcare subterană", "Balcon", "Centrală proprie", "Lift"],
  photos: [living, kitchen, bedroom, exterior],
};

export const mockPortfolio = [
  {
    reference: "RF-1024",
    title: "Apartament 3 camere, Aviației",
    city: "București",
    price: 158_000,
    transaction: "sale" as const,
    status: "active" as const,
    rooms: 3,
    surface: 78,
    photo: living,
  },
  {
    reference: "RF-1031",
    title: "Garsonieră mobilată, Mărăști",
    city: "Cluj-Napoca",
    price: 520,
    transaction: "rent" as const,
    status: "reserved" as const,
    rooms: 1,
    surface: 34,
    photo: bedroom,
  },
  {
    reference: "RF-1017",
    title: "Casă P+1, Pipera",
    city: "Voluntari",
    price: 385_000,
    transaction: "sale" as const,
    status: "negotiation" as const,
    rooms: 5,
    surface: 210,
    photo: exterior,
  },
  {
    reference: "RF-1040",
    title: "Apartament 2 camere, Floreasca",
    city: "București",
    price: 129_000,
    transaction: "sale" as const,
    status: "active" as const,
    rooms: 2,
    surface: 56,
    photo: kitchen,
  },
];

export const mockPipeline = [
  {
    stage: "new",
    cards: [
      { name: "Andreea Popescu", subject: "Apartament 2 camere, Floreasca", source: "Website" },
      { name: "Radu Constantin", subject: "Teren intravilan, Corbeanca", source: "Recomandare" },
    ],
  },
  {
    stage: "contacted",
    cards: [{ name: "Mihai Ionescu", subject: "Apartament 3 camere, Aviației", source: "Telefon" }],
  },
  {
    stage: "qualified",
    cards: [
      { name: "Elena Dumitrescu", subject: "Casă P+1, Pipera", source: "Portal" },
      { name: "Bogdan Stan", subject: "Garsonieră, Mărăști", source: "Website" },
    ],
  },
  {
    stage: "viewing",
    cards: [
      { name: "Cristina Marin", subject: "Apartament 2 camere, Floreasca", source: "Referral" },
    ],
  },
  {
    stage: "offer",
    cards: [{ name: "Alexandru Neagu", subject: "Casă P+1, Pipera", source: "Telefon" }],
  },
] as const;

export const mockLeadHistory = [
  { when: "azi, 10:42", kind: "stage", text: "Etapă schimbată: Contactat → Calificat" },
  { when: "azi, 10:40", kind: "note", text: "Notă: buget confirmat, preferă etaj intermediar" },
  { when: "ieri, 16:15", kind: "viewing", text: "Vizionare programată — RF-1024, joi 18:00" },
  { when: "ieri, 09:30", kind: "call", text: "Apel efectuat — 6 min" },
];

export const mockRequest = {
  title: "Apartament 3 camere, București",
  contact: "Mihai Ionescu",
  kind: "buy",
  budget: "până la 165.000 €",
  areas: "Aviației, Floreasca, Dorobanți",
  rooms: "3+ camere",
  surface: "min. 70 m²",
};

export const mockRequestMatches = [
  {
    reference: "RF-1024",
    title: "Apartament 3 camere, Aviației",
    price: 158_000,
    score: 92,
    reasons: ["Tip tranzacție", "Buget", "Zonă", "Camere", "Suprafață"],
    misses: [],
    photo: living,
  },
  {
    reference: "RF-1052",
    title: "Apartament 3 camere, Dorobanți",
    price: 171_000,
    score: 81,
    reasons: ["Tip tranzacție", "Zonă", "Camere", "Buget aproape de limită"],
    misses: [],
    photo: kitchen,
  },
  {
    reference: "RF-1040",
    title: "Apartament 2 camere, Floreasca",
    price: 129_000,
    score: 68,
    reasons: ["Tip tranzacție", "Buget", "Zonă"],
    misses: ["Camere sub minim"],
    photo: bedroom,
  },
];

export const mockPropertyMatches = [
  {
    name: "Mihai Ionescu",
    request: "Cumpărare · 3 camere · până la 165.000 €",
    score: 92,
    reasons: ["Buget", "Zonă", "Camere"],
  },
  {
    name: "Elena Dumitrescu",
    request: "Cumpărare · 3–4 camere · până la 200.000 €",
    score: 84,
    reasons: ["Buget", "Camere", "Suprafață"],
  },
  {
    name: "Ioana Petrescu",
    request: "Investiție · 2–3 camere · până la 150.000 €",
    score: 63,
    reasons: ["Zonă", "Camere"],
  },
];

export const mockKpis = [
  { label: "Proprietăți", value: 48, hint: "12 adăugate luna aceasta" },
  { label: "Lead-uri noi", value: 17, hint: "ultimele 7 zile" },
  { label: "Cereri", value: 23, hint: "6 cu potriviri noi" },
  { label: "Vizionări azi", value: 5, hint: "următoarea la 11:30" },
];

export const mockFunnel = [
  { stage: "new", value: 34 },
  { stage: "contacted", value: 27 },
  { stage: "qualified", value: 19 },
  { stage: "viewing", value: 12 },
  { stage: "offer", value: 7 },
  { stage: "negotiation", value: 5 },
  { stage: "won", value: 3 },
];

export const mockGoals = [
  { label: "Vizionări", current: 14, target: 20, agent: "Andrei M." },
  { label: "Lead-uri", current: 22, target: 30, agent: "Ioana R." },
  { label: "Tranzacții", current: 2, target: 4, agent: "Vlad P." },
];

export const mockAgenda = [
  { time: "09:30", kind: "call", title: "Apel — Andreea Popescu", meta: "Follow-up ofertă" },
  {
    time: "11:30",
    kind: "viewing",
    title: "Vizionare — RF-1024",
    meta: "Mihai Ionescu · Aviației",
  },
  { time: "14:00", kind: "meeting", title: "Semnare precontract", meta: "Casă P+1, Pipera" },
  {
    time: "17:00",
    kind: "followup",
    title: "Follow-up — Elena Dumitrescu",
    meta: "După vizionare",
  },
];

export const mockContacts = [
  { name: "Mihai Ionescu", type: "buyer", meta: "2 cereri · 1 lead activ", city: "București" },
  { name: "Elena Dumitrescu", type: "buyer", meta: "1 cerere · vizionare joi", city: "București" },
  { name: "Dan Voicu", type: "owner", meta: "Proprietar RF-1024", city: "București" },
  { name: "Ioana Petrescu", type: "investor", meta: "3 cereri · 2 lead-uri", city: "Cluj-Napoca" },
];

export const mockRequests = [
  { title: "Apartament 3 camere, București", kind: "buy", budget: "≤ 165.000 €", matches: 6 },
  { title: "Garsonieră închiriere, Cluj", kind: "rent", budget: "≤ 550 €/lună", matches: 3 },
  { title: "Spațiu comercial, Timișoara", kind: "rent", budget: "≤ 2.500 €/lună", matches: 1 },
];

export const mockAgentActivity = [
  { agent: "Andrei M.", calls: 26, viewings: 9, leads: 11 },
  { agent: "Ioana R.", calls: 31, viewings: 7, leads: 14 },
  { agent: "Vlad P.", calls: 18, viewings: 5, leads: 8 },
];
