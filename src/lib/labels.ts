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

export const propertyStatusTone: Record<
  string,
  "neutral" | "success" | "warning" | "info" | "danger"
> = {
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

// ---- Platformă / organizații ----------------------------------------------

export const organizationStatusLabels: Record<string, string> = {
  active: "Activă",
  trial: "Trial",
  suspended: "Suspendată",
  cancelled: "Anulată",
};

export const organizationStatusTone: Record<
  string,
  "neutral" | "success" | "warning" | "info" | "danger"
> = {
  active: "success",
  trial: "info",
  suspended: "warning",
  cancelled: "danger",
};

export const organizationPlanLabels: Record<string, string> = {
  basic: "Basic",
  pro: "Pro",
  unlimited: "Unlimited",
};


// ---- Audit ------------------------------------------------------------------

const auditActionLabels: Record<string, string> = {
  "agency.created": "Agenție creată",
  "lead.create": "Lead creat",
  "lead.update": "Lead actualizat",
  "lead.stage_change": "Etapă lead schimbată",
  "lead.stage_changed": "Etapă lead schimbată",
  "activity.status": "Status activitate schimbat",
  "activity.done": "Activitate finalizată",
  "activity.cancel": "Activitate anulată",
  "activity.reschedule": "Activitate reprogramată",
  "activity.duration": "Durată activitate modificată",
  "activity.delete": "Activitate ștearsă",
  property_created: "Proprietate creată",
  "property.created": "Proprietate creată",
  property_published: "Proprietate publicată",
  property_archived: "Proprietate arhivată",
  property_duplicated: "Proprietate duplicată",
  property_status_changed: "Status proprietate schimbat",
  request_status_changed: "Status cerere schimbat",
  request_preferences_updated: "Preferințe cerere actualizate",
  "qa.org_created": "Agenție demo creată (QA)",
  "qa.seeded": "Date demo populate (QA)",
  "qa.reseeded": "Date demo repopulate (QA)",
  "qa.reset": "Date demo resetate (QA)",
  "qa.credentials_rotated": "Parole demo rotite (QA)",
  "qa.purged": "Agenție demo ștearsă (QA)",
};

/** Etichetă lizibilă pentru o acțiune de audit; pentru chei necunoscute derivă din identificator. */
export function auditActionLabel(action: string): string {
  const known = auditActionLabels[action];
  if (known) return known;
  return action
    .replace(/[._]+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export const auditEntityLabels: Record<string, string> = {
  property: "Proprietate",
  properties: "Proprietate",
  contact: "Contact",
  contacts: "Contact",
  lead: "Lead",
  leads: "Lead",
  request: "Cerere",
  requests: "Cerere",
  activity: "Activitate",
  activities: "Activitate",
  organizations: "Agenție",
  organization: "Agenție",
  profiles: "Utilizator",
  user: "Utilizator",
  goals: "Obiectiv",
};
