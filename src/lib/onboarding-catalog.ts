import type { AppRole } from "@/hooks/use-session";
import type { AiFeatureKey } from "./ai/features/keys";

export type PlannedGuide = { id: string; title: string; group: string; trigger: string; access: string; roles: AppRole[]; feature: AiFeatureKey | null };

const agency: AppRole[] = ["agent", "agency_admin", "superadmin"];
const admin: AppRole[] = ["agency_admin", "superadmin"];
const superOnly: AppRole[] = ["superadmin"];

/**
 * Inventarul ghidurilor planificate pentru etapele următoare.
 * Câte un ghid pe pagină, filă sau fereastră; acțiunile mici sunt pași în ghidul paginii lor.
 * Ghidurile deja implementate (etapele 1–2) NU sunt aici: Dashboard/Primii pași,
 * Proprietăți (listă, unelte, adăugare), pagina proprietății (detaliu, editare, Poze,
 * Publicare, Promovare portaluri, Video și social, Lead-uri/cereri/activități,
 * Documente/Istoric, ACP, Marketing AI) și Colaborare.
 * Ghidurile doar pentru SuperAdmin sunt la final.
 */
export const plannedGuides: PlannedGuide[] = [
  // ————— Clienți —————
  { id: "contacts-list", title: "Contacte", group: "Clienți", trigger: "Prima deschidere a paginii Contacte", access: "Agent, admin", roles: agency, feature: null },
  { id: "contact-detail", title: "Pagina contactului", group: "Clienți", trigger: "Prima deschidere a unui contact (filele: Prezentare, Proprietăți, Cereri, Lead-uri, Activități, Vizionări, Documente, Note, Cronologie)", access: "Agent, admin", roles: agency, feature: null },
  { id: "contact-create", title: "Adaugă un contact", group: "Clienți", trigger: "Prima deschidere a ferestrei Adaugă contact", access: "Agent, admin", roles: agency, feature: null },
  { id: "requests-list", title: "Cereri", group: "Clienți", trigger: "Prima deschidere a paginii Cereri", access: "Agent, admin", roles: agency, feature: null },
  { id: "request-detail", title: "Pagina cererii", group: "Clienți", trigger: "Prima deschidere a unei cereri (Prezentare, Proprietăți compatibile, Lead-uri, Activități, Documente)", access: "Agent, admin", roles: agency, feature: null },
  { id: "leads-list", title: "Lead-uri", group: "Clienți", trigger: "Prima deschidere a paginii Lead-uri", access: "Agent, admin", roles: agency, feature: null },
  { id: "contracts-list", title: "Contracte", group: "Clienți", trigger: "Prima deschidere a paginii Contracte", access: "Agent, admin", roles: agency, feature: null },
  { id: "contract-detail", title: "Pagina contractului", group: "Clienți", trigger: "Prima deschidere a unui contract", access: "Agent, admin", roles: agency, feature: null },

  // ————— Anunțuri —————
  { id: "anunturi-particulari", title: "Anunțuri particulari", group: "Anunțuri", trigger: "Prima deschidere a paginii Anunțuri particulari (taburile Habitoo, Facebook, Argus)", access: "Agent, admin", roles: agency, feature: null },
  { id: "anunturi-particulari-detail", title: "Anunț de la un particular", group: "Anunțuri", trigger: "Prima deschidere a unui anunț din listă", access: "Agent, admin", roles: agency, feature: null },
  { id: "anunturi-import", title: "Import în portofoliu", group: "Anunțuri", trigger: "Prima folosire a acțiunii de import dintr-un anunț particular", access: "Agent, admin; importul creează draft, fără publicare", roles: agency, feature: null },

  // ————— Activitate —————
  { id: "activities", title: "Activități", group: "Activitate", trigger: "Prima deschidere a paginii Activități", access: "Agent, admin", roles: agency, feature: null },
  { id: "calendar", title: "Calendar", group: "Activitate", trigger: "Prima deschidere a paginii Calendar", access: "Agent, admin", roles: agency, feature: null },
  { id: "matching", title: "Potriviri", group: "Activitate", trigger: "Prima deschidere a paginii Potriviri", access: "Agent, admin", roles: agency, feature: null },
  { id: "notifications", title: "Notificări", group: "Activitate", trigger: "Prima deschidere a paginii Notificări", access: "Agent, admin", roles: agency, feature: null },
  { id: "clipurile-mele", title: "Clipurile mele", group: "Activitate", trigger: "Prima deschidere a paginii Clipurile mele", access: "Agent, admin", roles: agency, feature: null },
  { id: "support", title: "Suport", group: "Activitate", trigger: "Prima deschidere a paginii Suport", access: "Agent, admin", roles: agency, feature: null },

  // ————— Management —————
  { id: "team", title: "Echipa", group: "Management", trigger: "Prima deschidere a paginii Echipă", access: "Admin", roles: admin, feature: null },
  { id: "team-member", title: "Pagina unui coleg", group: "Management", trigger: "Prima deschidere a unui membru al echipei", access: "Admin", roles: admin, feature: null },
  { id: "comisioane", title: "Comisioane", group: "Management", trigger: "Prima deschidere a paginii Comisioane (adăugare, alocare, rapoarte și export sunt pași aici)", access: "Agent (ale sale), admin (agenția)", roles: agency, feature: null },
  { id: "reports", title: "Rapoarte", group: "Management", trigger: "Prima deschidere a paginii Rapoarte", access: "Admin", roles: admin, feature: null },
  { id: "goals", title: "Obiective", group: "Management", trigger: "Prima deschidere a paginii Obiective", access: "Admin", roles: admin, feature: null },
  { id: "settings", title: "Setări", group: "Management", trigger: "Prima deschidere a paginii Setări (profil, agenție, portaluri, promovare)", access: "Agent, admin", roles: agency, feature: null },
  { id: "abonament", title: "Abonament", group: "Management", trigger: "Prima deschidere a paginii Abonament", access: "Admin", roles: admin, feature: null },

  // ————— AI (doar cu funcția activată) —————
  { id: "ai-crm", title: "AI CRM", group: "AI", trigger: "Prima deschidere a paginii AI CRM", access: "Agent, admin; funcția AI CRM activată", roles: agency, feature: "ai_crm" },
  { id: "ai-marketing", title: "AI Marketing", group: "AI", trigger: "Prima deschidere a paginii AI Marketing", access: "Agent, admin; funcția AI Marketing activată", roles: agency, feature: "ai_marketing" },
  { id: "ai-media", title: "Studio AI", group: "AI", trigger: "Prima deschidere a paginii Studio AI", access: "Agent, admin; funcția Studio AI activată", roles: agency, feature: "ai_media" },
  { id: "ai-manager", title: "Habitoo Manager", group: "AI", trigger: "Prima deschidere a paginii Habitoo Manager", access: "Agent, admin; funcția Habitoo Manager activată", roles: agency, feature: "ai_manager" },

  // ————— SuperAdmin (la final) —————
  { id: "superadmin-dashboard", title: "SuperAdmin — privire de ansamblu", group: "SuperAdmin", trigger: "Prima deschidere a zonei SuperAdmin", access: "SuperAdmin", roles: superOnly, feature: null },
  { id: "superadmin-agencies", title: "Agenții", group: "SuperAdmin", trigger: "Prima deschidere a listei de agenții", access: "SuperAdmin", roles: superOnly, feature: null },
  { id: "superadmin-agency-detail", title: "Pagina unei agenții", group: "SuperAdmin", trigger: "Prima deschidere a unei agenții", access: "SuperAdmin", roles: superOnly, feature: null },
  { id: "superadmin-users", title: "Utilizatori", group: "SuperAdmin", trigger: "Prima deschidere a listei de utilizatori", access: "SuperAdmin", roles: superOnly, feature: null },
  { id: "superadmin-cereri-abonament", title: "Cereri de abonament", group: "SuperAdmin", trigger: "Prima deschidere a paginii Cereri de abonament", access: "SuperAdmin", roles: superOnly, feature: null },
  { id: "superadmin-portals", title: "Portaluri", group: "SuperAdmin", trigger: "Prima deschidere a paginii Portaluri", access: "SuperAdmin", roles: superOnly, feature: null },
  { id: "superadmin-portal-logs", title: "Jurnal portaluri", group: "SuperAdmin", trigger: "Prima deschidere a paginii Jurnal portaluri", access: "SuperAdmin", roles: superOnly, feature: null },
  { id: "superadmin-ai-features", title: "Funcții AI", group: "SuperAdmin", trigger: "Prima deschidere a paginii Funcții AI", access: "SuperAdmin", roles: superOnly, feature: null },
  { id: "superadmin-mail", title: "Emailuri", group: "SuperAdmin", trigger: "Prima deschidere a paginii de emailuri", access: "SuperAdmin", roles: superOnly, feature: null },
  { id: "superadmin-audit", title: "Audit", group: "SuperAdmin", trigger: "Prima deschidere a paginii Audit", access: "SuperAdmin", roles: superOnly, feature: null },
  { id: "superadmin-deleted", title: "Înregistrări șterse", group: "SuperAdmin", trigger: "Prima deschidere a paginii de înregistrări șterse", access: "SuperAdmin", roles: superOnly, feature: null },
  { id: "superadmin-muzica", title: "Muzică video", group: "SuperAdmin", trigger: "Prima deschidere a bibliotecii de muzică", access: "SuperAdmin", roles: superOnly, feature: null },
  { id: "superadmin-nomenclator", title: "Nomenclator", group: "SuperAdmin", trigger: "Prima deschidere a paginii Nomenclator", access: "SuperAdmin", roles: superOnly, feature: null },
  { id: "superadmin-qa", title: "QA", group: "SuperAdmin", trigger: "Prima deschidere a paginii QA", access: "SuperAdmin", roles: superOnly, feature: null },
  { id: "superadmin-support", title: "Suport", group: "SuperAdmin", trigger: "Prima deschidere a paginii Suport", access: "SuperAdmin", roles: superOnly, feature: null },
  { id: "superadmin-stare-agentii", title: "Stare agenții", group: "SuperAdmin", trigger: "Prima deschidere a paginii Stare agenții", access: "SuperAdmin", roles: superOnly, feature: null },
  { id: "date-piata", title: "Date piață", group: "SuperAdmin", trigger: "Prima deschidere a paginii Date piață", access: "SuperAdmin", roles: superOnly, feature: null },
];
