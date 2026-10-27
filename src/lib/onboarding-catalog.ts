import type { AppRole } from "@/hooks/use-session";
import type { AiFeatureKey } from "./ai/features/keys";

export type PlannedGuide = { id: string; title: string; group: string; trigger: string; access: string; roles: AppRole[]; feature: AiFeatureKey | null };

const agency: AppRole[] = ["agent", "agency_admin", "superadmin"];
const admin: AppRole[] = ["agency_admin", "superadmin"];

/**
 * Inventarul ghidurilor planificate pentru etapele următoare.
 * Câte un ghid pe pagină, filă sau fereastră; acțiunile mici sunt pași în ghidul paginii lor.
 * Ghidurile deja implementate (etapele 1–3) NU sunt aici: Dashboard/Primii pași,
 * Proprietăți (listă, unelte, adăugare), pagina proprietății (detaliu, editare, Poze,
 * Publicare, Promovare portaluri, Video și social, Lead-uri/cereri/activități,
 * Documente/Istoric, ACP, Marketing AI) și Colaborare.
 * Nu sunt planificate ghiduri exclusiv pentru SuperAdmin.
 */
export const plannedGuides: PlannedGuide[] = [
  // ————— Clienți —————

  // ————— Anunțuri —————

  // ————— Activitate —————

  // ————— Analize ACP —————

  // ————— Management —————
  { id: "team", title: "Echipa", group: "Management", trigger: "Prima deschidere a paginii Echipă", access: "Admin", roles: admin, feature: null },
  { id: "team-member", title: "Pagina unui coleg", group: "Management", trigger: "Prima deschidere a unui membru al echipei", access: "Admin", roles: admin, feature: null },
  { id: "comisioane", title: "Comisioane", group: "Management", trigger: "Prima deschidere a paginii Comisioane (adăugare, alocare, rapoarte și export sunt pași aici)", access: "Agent (ale sale), admin (agenția)", roles: agency, feature: null },
  { id: "reports", title: "Rapoarte", group: "Management", trigger: "Prima deschidere a paginii Rapoarte", access: "Admin", roles: admin, feature: null },
  { id: "goals", title: "Obiective", group: "Management", trigger: "Prima deschidere a paginii Obiective", access: "Admin", roles: admin, feature: null },
  { id: "settings", title: "Setări", group: "Management", trigger: "Prima deschidere a paginii Setări (profil, agenție, portaluri, promovare)", access: "Agent, admin", roles: agency, feature: null },
  { id: "abonament", title: "Abonament", group: "Management", trigger: "Prima deschidere a paginii Abonament", access: "Admin", roles: admin, feature: null },

  // ————— AI (doar cu funcția activată) —————

];
