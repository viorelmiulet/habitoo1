export const propertyStatusLabels: Record<string, string> = {
  draft: "Draft",
  active: "Activ",
  reserved: "Rezervat",
  negotiation: "În negociere",
  sold: "Vândut",
  rented: "Închiriat",
  expired: "Expirat",
  archived: "Arhivat",
};

export const propertyStatusTone: Record<string, "neutral" | "success" | "warning" | "info" | "danger"> = {
  draft: "neutral",
  active: "success",
  reserved: "warning",
  negotiation: "info",
  sold: "info",
  rented: "info",
  expired: "danger",
  archived: "neutral",
};

export const transactionLabels: Record<string, string> = {
  sale: "Vânzare",
  rent: "Închiriere",
};

export const propertyTypeLabels: Record<string, string> = {
  apartment: "Apartament",
  studio: "Garsonieră",
  house: "Casă / Vilă",
  land: "Teren",
  commercial: "Spațiu comercial",
  office: "Birou",
  industrial: "Industrial",
};

export const contactTypeLabels: Record<string, string> = {
  owner: "Proprietar",
  buyer: "Cumpărător",
  tenant: "Chiriaș",
  investor: "Investitor",
  agent: "Agent",
  partner: "Partener",
  developer: "Dezvoltator",
  company: "Companie",
};

export const requestKindLabels: Record<string, string> = {
  buy: "Cumpărare",
  rent: "Închiriere",
  invest: "Investiție",
};

export const leadStages = [
  "new",
  "contacted",
  "qualified",
  "viewing",
  "offer",
  "negotiation",
  "transaction",
  "won",
  "lost",
] as const;

export const leadStageLabels: Record<string, string> = {
  new: "Nou",
  contacted: "Contactat",
  qualified: "Calificat",
  viewing: "Vizionare",
  offer: "Ofertă",
  negotiation: "Negociere",
  transaction: "Tranzacție",
  won: "Câștigat",
  lost: "Pierdut",
};

export const activityKindLabels: Record<string, string> = {
  call: "Apel",
  meeting: "Întâlnire",
  viewing: "Vizionare",
  task: "Task",
  email: "Email",
  followup: "Follow-up",
  note: "Notă",
};

export const goalMetricLabels: Record<string, string> = {
  leads: "Lead-uri",
  viewings: "Vizionări",
  new_properties: "Proprietăți noi",
  transactions: "Tranzacții",
  commission: "Comision",
};

export const roleLabels: Record<string, string> = {
  superadmin: "Superadmin",
  agency_admin: "Admin agenție",
  agent: "Agent",
};
