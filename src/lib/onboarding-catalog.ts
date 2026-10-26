import type { AppRole } from "@/hooks/use-session";
import type { AiFeatureKey } from "./ai/features/keys";
export type PlannedGuide = { id: string; title: string; group: string; trigger: string; access: string; roles: AppRole[]; feature: AiFeatureKey | null };
export const plannedGuides: PlannedGuide[] = [
  {
    "id": "planned-4",
    "title": "Proprietate — fila Agent",
    "group": "Portofoliu",
    "trigger": "`/app/properties/$id`, `Tabs value=\"agent\"`",
    "access": "Agent; reasignare/administrare numai admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-5",
    "title": "Proprietate — fila Prezentare",
    "group": "Portofoliu",
    "trigger": "pagina de detaliu menționată mai sus, valoarea sursă `overview`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-6",
    "title": "Proprietate — fila Poze / media",
    "group": "Portofoliu",
    "trigger": "pagina de detaliu menționată mai sus, `media`; `PropertyMediaManager`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-7",
    "title": "Proprietate — fila Publicare",
    "group": "Portofoliu",
    "trigger": "pagina de detaliu menționată mai sus, `publishing`; `PropertyPublishView`/card portaluri",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-8",
    "title": "Proprietate — fila Promovare",
    "group": "Portofoliu",
    "trigger": "pagina de detaliu menționată mai sus, `promotion`; promovări și `PropertyPromotionTab`",
    "access": "Agent, admin (acțiuni dependente de portal/eligibilitate)",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-9",
    "title": "Proprietate — fila Lead-uri",
    "group": "Portofoliu",
    "trigger": "pagina de detaliu menționată mai sus, `leads`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-10",
    "title": "Proprietate — Cereri compatibile",
    "group": "Portofoliu",
    "trigger": "pagina de detaliu menționată mai sus, `matching`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-11",
    "title": "Proprietate — Activități",
    "group": "Portofoliu",
    "trigger": "pagina de detaliu menționată mai sus, `activities`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-12",
    "title": "Proprietate — Documente",
    "group": "Portofoliu",
    "trigger": "pagina de detaliu menționată mai sus, `documents`; `DocumentsPanel`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-13",
    "title": "Proprietate — ACP",
    "group": "Portofoliu",
    "trigger": "pagina de detaliu menționată mai sus, `acp`; `PropertyAcpCard`",
    "access": "Agent/admin; funcționalitate ACP disponibilă",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-14",
    "title": "Proprietate — Marketing AI",
    "group": "Portofoliu",
    "trigger": "pagina de detaliu menționată mai sus, `marketing`; componenta de marketing AI",
    "access": "Agent/admin; AI activat unde este cerut",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-15",
    "title": "Proprietate — Istoric",
    "group": "Portofoliu",
    "trigger": "pagina de detaliu menționată mai sus, `history`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-16",
    "title": "Reasignare agent proprietate",
    "group": "Portofoliu",
    "trigger": "`/app/properties/$id`; buton „Schimbă agentul”",
    "access": "Admin numai",
    "roles": [
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-17",
    "title": "Fișă proprietate / PDF",
    "group": "Portofoliu",
    "trigger": "`/app/properties/$id`; butonul de fișă deschide dialog `Fișă de proprietate`; `PropertySheetTemplatePicker`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-18",
    "title": "Adaugă client (lead) din proprietate",
    "group": "Portofoliu",
    "trigger": "pagina de detaliu menționată mai sus; acțiunea „Adaugă client (lead)”",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-19",
    "title": "Arhivează proprietatea",
    "group": "Portofoliu",
    "trigger": "pagina de detaliu menționată mai sus; `ArchivePropertyDialog`",
    "access": "Agent, admin (permisiunile de proprietate se aplică)",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-20",
    "title": "Șterge proprietatea",
    "group": "Portofoliu",
    "trigger": "pagina de detaliu menționată mai sus; `DeletePropertyDialog`",
    "access": "Agent, admin (permisiunile de proprietate se aplică)",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-21",
    "title": "AI media pentru proprietate",
    "group": "Portofoliu",
    "trigger": "componenta `AiMediaPanel` din media",
    "access": "AI condiționat; controlul ecranului proprietății",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-22",
    "title": "Video proprietate",
    "group": "Portofoliu",
    "trigger": "componenta `PropertyVideoCard` din prezentarea proprietății",
    "access": "Agent/admin; disponibilitate media/video",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-23",
    "title": "Clipurile mele",
    "group": "Portofoliu",
    "trigger": "`/app/clipurile-mele`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-24",
    "title": "Contacte — listă",
    "group": "Clienți",
    "trigger": "`/app/contacts`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-25",
    "title": "Contact — Prezentare",
    "group": "Clienți",
    "trigger": "`/app/contacts/$id`, `overview`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-26",
    "title": "Contact — Proprietăți",
    "group": "Clienți",
    "trigger": "pagina de detaliu menționată mai sus, `properties`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-27",
    "title": "Contact — Cereri",
    "group": "Clienți",
    "trigger": "pagina de detaliu menționată mai sus, `requests`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-28",
    "title": "Contact — Lead-uri",
    "group": "Clienți",
    "trigger": "pagina de detaliu menționată mai sus, `leads`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-29",
    "title": "Contact — Activități",
    "group": "Clienți",
    "trigger": "pagina de detaliu menționată mai sus, `activities`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-30",
    "title": "Contact — Vizionări",
    "group": "Clienți",
    "trigger": "pagina de detaliu menționată mai sus, `viewings`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-31",
    "title": "Contact — Documente",
    "group": "Clienți",
    "trigger": "pagina de detaliu menționată mai sus, `documents`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-32",
    "title": "Contact — Note",
    "group": "Clienți",
    "trigger": "pagina de detaliu menționată mai sus, `notes`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-33",
    "title": "Contact — Cronologie",
    "group": "Clienți",
    "trigger": "pagina de detaliu menționată mai sus, `timeline`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-34",
    "title": "Contact — creează cerere",
    "group": "Clienți",
    "trigger": "`/app/contacts/$id`; butonul care setează `requestDialogOpen`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-35",
    "title": "Cereri — listă",
    "group": "Clienți",
    "trigger": "`/app/requests`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-36",
    "title": "Cerere — Prezentare",
    "group": "Clienți",
    "trigger": "`/app/requests/$id`, `overview`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-37",
    "title": "Cerere — Proprietăți compatibile",
    "group": "Clienți",
    "trigger": "pagina de detaliu menționată mai sus, `matching`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-38",
    "title": "Cerere — Lead-uri",
    "group": "Clienți",
    "trigger": "pagina de detaliu menționată mai sus, `leads`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-39",
    "title": "Cerere — Activități",
    "group": "Clienți",
    "trigger": "pagina de detaliu menționată mai sus, `activities`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-40",
    "title": "Cerere — Documente",
    "group": "Clienți",
    "trigger": "pagina de detaliu menționată mai sus, `documents`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-41",
    "title": "Lead-uri",
    "group": "Clienți",
    "trigger": "`/app/leads`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-42",
    "title": "Șterge lead",
    "group": "Clienți",
    "trigger": "`/app/leads`; `DeleteLeadDialog` declanșat din acțiunea de ștergere",
    "access": "Agent, admin în limita accesului la lead",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-43",
    "title": "Contracte — listă",
    "group": "Clienți",
    "trigger": "`/app/contracts`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-44",
    "title": "Contract — detalii",
    "group": "Clienți",
    "trigger": "`/app/contracts/$id`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-45",
    "title": "Contract nou",
    "group": "Clienți",
    "trigger": "`/app/contracts`; acțiune creare, `NewContractDialog`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-46",
    "title": "Inventar contractual",
    "group": "Clienți",
    "trigger": "editor `contracts/InventoryEditor` în fluxul contractului",
    "access": "Agent, admin; tip contract cu inventar",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-47",
    "title": "Semnătură contract",
    "group": "Clienți",
    "trigger": "`contracts/SignaturePad` în fluxul de semnare",
    "access": "Agent, admin; în fluxul contractului",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-48",
    "title": "Comisioane",
    "group": "Comisioane",
    "trigger": "`/app/comisioane`",
    "access": "Agent, admin; vizibilitatea/edibilitatea comisionului după alocare",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-49",
    "title": "Adaugă / modifică comision",
    "group": "Comisioane",
    "trigger": "`/app/comisioane`; „Adaugă comision” sau editarea înregistrării, dialog",
    "access": "Agent; admin poate gestiona; alocările admin sunt numai citire pentru agent",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-50",
    "title": "Șterge comision",
    "group": "Comisioane",
    "trigger": "`/app/comisioane`; acțiunea de ștergere, confirmare",
    "access": "Permisiunea de comision; alocările protejate",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-51",
    "title": "Rapoarte comisioane",
    "group": "Comisioane",
    "trigger": "`/app/comisioane`; `CommissionReports` / export",
    "access": "Agent/admin după datele accesibile",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-52",
    "title": "Colaborare — oferte partenere",
    "group": "Rețea",
    "trigger": "`/app/collaboration`, fila `offers`",
    "access": "Agent, admin; colaborarea agenției trebuie permisă",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-53",
    "title": "Colaborare — trimise",
    "group": "Rețea",
    "trigger": "pagina de detaliu menționată mai sus, fila `outgoing`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-54",
    "title": "Colaborare — primite",
    "group": "Rețea",
    "trigger": "pagina de detaliu menționată mai sus, fila `incoming`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-55",
    "title": "Detalii ofertă de colaborare",
    "group": "Rețea",
    "trigger": "`/app/collaboration`; selectarea unei oferte deschide dialog",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-56",
    "title": "Propune unui client",
    "group": "Rețea",
    "trigger": "`/app/collaboration`; acțiunea de propunere, dialog `Propune unui client`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-57",
    "title": "Răspunde la ofertă",
    "group": "Rețea",
    "trigger": "`/app/collaboration`; acțiunea asupra ofertei primite (dialog legat de ID)",
    "access": "Agent, admin; ofertă existentă",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-58",
    "title": "Anunțuri particulari",
    "group": "Anunțuri",
    "trigger": "`/app/anunturi-particulari`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-59",
    "title": "Anunț particular — detaliu",
    "group": "Anunțuri",
    "trigger": "`/app/anunturi-particulari/$id`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-60",
    "title": "Habitoo Manager",
    "group": "Asistent AI",
    "trigger": "`/app/ai-manager`",
    "access": "AI condiționat: `ai_manager`",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": "ai_manager"
  },
  {
    "id": "planned-61",
    "title": "AI CRM",
    "group": "Asistent AI",
    "trigger": "`/app/ai-crm`",
    "access": "AI condiționat: `ai_crm`",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": "ai_crm"
  },
  {
    "id": "planned-62",
    "title": "AI Marketing",
    "group": "Asistent AI",
    "trigger": "`/app/ai-marketing`",
    "access": "AI condiționat: `ai_marketing`",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": "ai_marketing"
  },
  {
    "id": "planned-63",
    "title": "Habitoo AI",
    "group": "Asistent AI",
    "trigger": "`/app/ai`",
    "access": "AI condiționat: `ai_assistant`",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": "ai_assistant"
  },
  {
    "id": "planned-64",
    "title": "Studio AI — generare media",
    "group": "Asistent AI",
    "trigger": "`/app/ai-media`; `AiMediaPanel`",
    "access": "AI condiționat: `ai_media`",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": "ai_media"
  },
  {
    "id": "planned-65",
    "title": "Analiză ACP nouă",
    "group": "ACP",
    "trigger": "`/app/acp/new`",
    "access": "Agent, admin; ACP disponibil",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-66",
    "title": "Analize ACP salvate",
    "group": "ACP",
    "trigger": "`/app/acp`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-67",
    "title": "Analiză ACP — detalii",
    "group": "ACP",
    "trigger": "`/app/acp/$id`",
    "access": "Agent, admin; analiză accesibilă",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-72",
    "title": "Activități",
    "group": "Productivitate",
    "trigger": "`/app/activities`; listă și filtre în URL",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-73",
    "title": "Creează activitate",
    "group": "Productivitate",
    "trigger": "`/app/activities`; „Adaugă activitate”, ori `?openNew`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-74",
    "title": "Reprogramează activitate",
    "group": "Productivitate",
    "trigger": "`/app/activities`; acțiunea „Reprogramează”",
    "access": "Agent, admin (activitatea accesibilă)",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-75",
    "title": "Șterge activitate",
    "group": "Productivitate",
    "trigger": "`/app/activities`; acțiunea ștergere → confirmare „Ștergi activitatea?”",
    "access": "Agent, admin (activitatea accesibilă)",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-76",
    "title": "Calendar",
    "group": "Productivitate",
    "trigger": "`/app/calendar`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-77",
    "title": "Creează activitate din calendar",
    "group": "Productivitate",
    "trigger": "`/app/calendar`; selectarea slotului/zii deschide dialogul",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-78",
    "title": "Șterge activitate din calendar",
    "group": "Productivitate",
    "trigger": "`/app/calendar`; acțiunea ștergere → „Ștergi această activitate?”",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-79",
    "title": "Matching",
    "group": "Productivitate",
    "trigger": "`/app/matching`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-80",
    "title": "Rapoarte",
    "group": "Management",
    "trigger": "`/app/reports`",
    "access": "Agent, admin; raportare după date accesibile",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-81",
    "title": "Obiective",
    "group": "Management",
    "trigger": "`/app/goals`",
    "access": "Agent, admin (afișare în funcție de echipă/rol)",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-82",
    "title": "Notificări",
    "group": "Management",
    "trigger": "`/app/notifications`; și meniul `NotificationsMenu` din topbar",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-83",
    "title": "Chat / Messenger",
    "group": "Management",
    "trigger": "`Messenger` din shell/topbar; deschis din butonul de chat",
    "access": "Utilizator autentificat; participanți conversație",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-84",
    "title": "Tichetele mele — suport",
    "group": "Management",
    "trigger": "`/app/support`; componenta `SupportThread`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-85",
    "title": "Widget suport",
    "group": "Management",
    "trigger": "`SupportWidget` în shell; deschidere widget",
    "access": "Utilizator autentificat",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-86",
    "title": "Echipă — listă agenți",
    "group": "Management",
    "trigger": "`/app/team` (și `/app/team/`)",
    "access": "Admin numai; ascuns în `agentNav`",
    "roles": [
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-87",
    "title": "Agent — detalii",
    "group": "Management",
    "trigger": "`/app/team/$id`",
    "access": "Admin numai",
    "roles": [
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-88",
    "title": "Membrii echipei — setări",
    "group": "Management",
    "trigger": "`/app/settings?tab=team`; fila `team`",
    "access": "Admin; „Echipa ta” trimite către pagina Agenți",
    "roles": [
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-89",
    "title": "Setări — profil",
    "group": "Management",
    "trigger": "`/app/settings?tab=profile` (implicit `/app/settings`)",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-90",
    "title": "Setări — acces",
    "group": "Management",
    "trigger": "`/app/settings?tab=access`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-91",
    "title": "Setări — agenție",
    "group": "Management",
    "trigger": "`/app/settings?tab=agency`",
    "access": "Admin cu rol `agency_admin`",
    "roles": [
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-92",
    "title": "Setări — branding",
    "group": "Management",
    "trigger": "`/app/settings?tab=branding`",
    "access": "Admin",
    "roles": [
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-93",
    "title": "Setări — echipă",
    "group": "Management",
    "trigger": "`/app/settings?tab=team`",
    "access": "Admin",
    "roles": [
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-94",
    "title": "Setări — portaluri",
    "group": "Management",
    "trigger": "`/app/settings?tab=portals`",
    "access": "Admin",
    "roles": [
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-95",
    "title": "Setări — promovare",
    "group": "Management",
    "trigger": "`/app/settings?tab=promotion`",
    "access": "Admin",
    "roles": [
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-96",
    "title": "Setări — integrări",
    "group": "Management",
    "trigger": "`/app/settings?tab=integrations`",
    "access": "Admin",
    "roles": [
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-97",
    "title": "Setări — AI",
    "group": "Management",
    "trigger": "`/app/settings?tab=ai`",
    "access": "Admin și `organization.ai_enabled === true` ori superadmin",
    "roles": [
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-98",
    "title": "Abonament",
    "group": "Management",
    "trigger": "`/abonament`; navigație admin „Alege abonamentul”",
    "access": "Admin; solicitarea/alegerea planului",
    "roles": [
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-99",
    "title": "Banner trial / abonament",
    "group": "Management",
    "trigger": "`TrialBanner` / `SubscriptionBanner` în shell",
    "access": "Cont în perioada trial/condiție abonament",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-100",
    "title": "Argus — conectare",
    "group": "Management",
    "trigger": "fila de integrări din Setări; `ArgusConnectionCard` / `argus/ArgusTab`",
    "access": "Admin; integrarea configurabilă",
    "roles": [
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-101",
    "title": "Meta/Facebook — conectare și catalog",
    "group": "Management",
    "trigger": "Setări → Integrări; `MetaConnectionCard`, `FacebookCatalogCard`",
    "access": "Admin; cont/conectare Meta",
    "roles": [
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-102",
    "title": "YouTube — conectare",
    "group": "Management",
    "trigger": "Setări → Integrări; `YoutubeConnectionCard`",
    "access": "Admin; cont/conectare YouTube",
    "roles": [
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-103",
    "title": "Instagram — publicare",
    "group": "Portofoliu",
    "trigger": "dialog `InstagramPostDialog`, lansat din fluxul social",
    "access": "Utilizator cu acces la proprietate; integrare socială",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-104",
    "title": "Meta — publicare postare",
    "group": "Portofoliu",
    "trigger": "`MetaPostDialog`, din fluxul social",
    "access": "Utilizator; integrare Meta conectată",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-105",
    "title": "YouTube — publicare clip",
    "group": "Portofoliu",
    "trigger": "`YoutubePostDialog`, din flux video",
    "access": "Utilizator; integrare YouTube conectată",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-106",
    "title": "Conectare Properstar/feed-uri",
    "group": "Management",
    "trigger": "Setări/integrări: `ProperstarFeedCard`, `SiteFeedCard`",
    "access": "Admin",
    "roles": [
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-107",
    "title": "Canal public Facebook catalog",
    "group": "Management",
    "trigger": "Setări/integrări: `FacebookCatalogCard`",
    "access": "Admin",
    "roles": [
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-108",
    "title": "Profil editare",
    "group": "Management",
    "trigger": "Setări → profil; `ProfileEditForm`",
    "access": "Agent, admin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-109",
    "title": "Date companie / verificare ANAF",
    "group": "Management",
    "trigger": "Setări → Agenție; `AgencyCompanyDataFields`, `CompanyAnafSync`",
    "access": "Admin `agency_admin`",
    "roles": [
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-110",
    "title": "Date incomplete agenție",
    "group": "Management",
    "trigger": "`CompleteAgencyData` în shell/flux de completare",
    "access": "Admin; numai când lipsesc date necesare",
    "roles": [
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-111",
    "title": "Profil incomplet utilizator",
    "group": "Management",
    "trigger": "`CompleteUserProfile` în shell/flux de completare",
    "access": "Utilizator; numai când lipsesc date",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-112",
    "title": "Caută în CRM",
    "group": "Bara de sus",
    "trigger": "`GlobalSearch` din topbar",
    "access": "Utilizator autentificat",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "planned-113",
    "title": "Adăugare rapidă",
    "group": "Bara de sus",
    "trigger": "`QuickAdd` din shell",
    "access": "Utilizator autentificat; entitățile permise",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "platform-15",
    "title": "Dashboard global",
    "group": "Platformă",
    "trigger": "meniul; `/superadmin`",
    "access": "SuperAdmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "platform-16",
    "title": "Agenții",
    "group": "Platformă",
    "trigger": "`/superadmin/agencies`",
    "access": "SuperAdmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "platform-17",
    "title": "Detaliu agenție",
    "group": "Platformă",
    "trigger": "`/superadmin/agencies/$id`",
    "access": "SuperAdmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "platform-18",
    "title": "Stare agenții",
    "group": "Platformă",
    "trigger": "`/superadmin/stare-agentii`",
    "access": "SuperAdmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "platform-19",
    "title": "Cereri abonament",
    "group": "Platformă",
    "trigger": "`/superadmin/cereri-abonament`",
    "access": "SuperAdmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "platform-20",
    "title": "Utilizatori",
    "group": "Platformă",
    "trigger": "`/superadmin/users`",
    "access": "SuperAdmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "platform-21",
    "title": "Detaliu utilizator",
    "group": "Platformă",
    "trigger": "`/superadmin/users/$id`",
    "access": "SuperAdmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "platform-22",
    "title": "Portaluri",
    "group": "Platformă",
    "trigger": "`/superadmin/portals`",
    "access": "SuperAdmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "platform-23",
    "title": "Jurnal portaluri",
    "group": "Platformă",
    "trigger": "`/superadmin/portal-logs`",
    "access": "SuperAdmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "platform-24",
    "title": "Funcții AI",
    "group": "Platformă",
    "trigger": "`/superadmin/ai-features`",
    "access": "SuperAdmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "platform-25",
    "title": "Email",
    "group": "Platformă",
    "trigger": "`/superadmin/mail`",
    "access": "SuperAdmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "platform-26",
    "title": "Blog",
    "group": "Platformă",
    "trigger": "`/superadmin/blog`",
    "access": "SuperAdmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "platform-27",
    "title": "Preview blog",
    "group": "Platformă",
    "trigger": "`/superadmin/blog/preview/$id` (inclusiv `new`)",
    "access": "SuperAdmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "platform-28",
    "title": "Muzică video",
    "group": "Platformă",
    "trigger": "`/superadmin/muzica`",
    "access": "SuperAdmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "platform-29",
    "title": "Suport",
    "group": "Platformă",
    "trigger": "`/superadmin/support`",
    "access": "SuperAdmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "platform-30",
    "title": "Nomenclator localități",
    "group": "Platformă",
    "trigger": "`/superadmin/nomenclator`",
    "access": "SuperAdmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "platform-31",
    "title": "QA / Demo Data",
    "group": "Platformă",
    "trigger": "`/superadmin/qa`",
    "access": "SuperAdmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "platform-32",
    "title": "Jurnal audit",
    "group": "Audit",
    "trigger": "`/superadmin/audit`",
    "access": "SuperAdmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "platform-33",
    "title": "Elemente șterse",
    "group": "Audit",
    "trigger": "`/superadmin/deleted`",
    "access": "SuperAdmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-0",
    "title": "Editează proprietatea",
    "group": "Portofoliu",
    "trigger": "/app/properties/$id/edit",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-1",
    "title": "Listă, Carduri și Publicare",
    "group": "Portofoliu",
    "trigger": "schimbarea vederii în lista Proprietăți",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-2",
    "title": "Selecție și acțiuni în masă",
    "group": "Portofoliu",
    "trigger": "selectarea proprietăților în listă",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-3",
    "title": "Vederi salvate",
    "group": "Portofoliu",
    "trigger": "deschiderea selectorului de vederi din Proprietăți",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-4",
    "title": "Import și export proprietăți",
    "group": "Portofoliu",
    "trigger": "deschiderea fluxului de import sau Export CSV",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-5",
    "title": "Adaugă și ordonează fotografii",
    "group": "Portofoliu",
    "trigger": "Poze/media → încărcare și reordonare",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-6",
    "title": "Confidențialitatea fotografiilor",
    "group": "Portofoliu",
    "trigger": "Poze/media → opțiunile fotografiei",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-7",
    "title": "Vizualizator de fotografii",
    "group": "Portofoliu",
    "trigger": "deschiderea galeriei din proprietate sau ofertă",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-8",
    "title": "Selectarea portalurilor și validări",
    "group": "Portofoliu",
    "trigger": "Publicare → configurarea portalurilor",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-9",
    "title": "Promovări Imobiliare.ro și imoradar24",
    "group": "Portofoliu",
    "trigger": "cardul Imobiliare.ro → promovări/destinație",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-10",
    "title": "Schimbă statusul proprietății",
    "group": "Portofoliu",
    "trigger": "deschiderea dialogului de status; explicație înainte de confirmare",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-11",
    "title": "Republicare și retragere portaluri",
    "group": "Portofoliu",
    "trigger": "dialogul dedicat; explicație înainte de confirmare",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-12",
    "title": "Modele de poster social",
    "group": "Portofoliu",
    "trigger": "deschiderea selectorului de poster",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-13",
    "title": "Muzica unui clip",
    "group": "Portofoliu",
    "trigger": "generator video → alegerea muzicii",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-14",
    "title": "Adaugă sau editează contact",
    "group": "Clienți",
    "trigger": "formular contact nou/editare",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-15",
    "title": "Adaugă sau editează cerere",
    "group": "Clienți",
    "trigger": "formular cerere nouă/editare",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-16",
    "title": "Adaugă sau editează lead",
    "group": "Clienți",
    "trigger": "dialog lead nou/editare",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-17",
    "title": "Pipeline și etapele lead-ului",
    "group": "Clienți",
    "trigger": "vederea Kanban și mutarea între etape",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-18",
    "title": "Citirea cărții de identitate",
    "group": "Clienți",
    "trigger": "contract → deschiderea citirii actului",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-19",
    "title": "Modele și PDF contract",
    "group": "Clienți",
    "trigger": "alegerea modelului și previzualizarea PDF",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-20",
    "title": "Invitație de semnare",
    "group": "Clienți",
    "trigger": "deschiderea invitației; fără trimitere automată",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-21",
    "title": "Export Excel/CSV",
    "group": "Comisioane",
    "trigger": "meniul Exportă din Comisioane",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-22",
    "title": "PDF rapoarte comisioane",
    "group": "Comisioane",
    "trigger": "butonul Descarcă PDF din Rapoarte",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-23",
    "title": "Monedă și curs păstrat",
    "group": "Comisioane",
    "trigger": "alegerea EUR/RON și formularul comisionului",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-24",
    "title": "MAP Habitoo",
    "group": "Anunțuri",
    "trigger": "/app/anunturi-particulari → fila MAP Habitoo",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-25",
    "title": "MAP Facebook",
    "group": "Anunțuri",
    "trigger": "/app/anunturi-particulari?lista=facebook",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-26",
    "title": "Argus — căutare",
    "group": "Anunțuri",
    "trigger": "/app/anunturi-particulari → fila Argus",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-27",
    "title": "Argus — detalii și telefon",
    "group": "Anunțuri",
    "trigger": "deschiderea detaliului Argus; telefon numai la cerere",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-28",
    "title": "Importă în portofoliu",
    "group": "Anunțuri",
    "trigger": "card/detaliu → Ai obținut acordul proprietarului?",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-29",
    "title": "Comentarii între agenți",
    "group": "Anunțuri",
    "trigger": "detaliu anunț → comentarii",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-30",
    "title": "Comparabile și recalculare",
    "group": "ACP",
    "trigger": "/app/acp/$id → lista comparabilelor",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-31",
    "title": "Versiuni ACP și raport PDF",
    "group": "ACP",
    "trigger": "analiză → versiuni/PDF",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-32",
    "title": "Explicația AI a analizei",
    "group": "ACP",
    "trigger": "analiză → cardul AI",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": "acp_ai"
  },
  {
    "id": "flow-33",
    "title": "Imagine de marketing",
    "group": "Asistent AI",
    "trigger": "Studio AI → marketing_image",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": "ai_media"
  },
  {
    "id": "flow-34",
    "title": "Îmbunătățește o fotografie",
    "group": "Asistent AI",
    "trigger": "Studio AI → photo_enhance",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": "ai_media"
  },
  {
    "id": "flow-35",
    "title": "Video din fotografie",
    "group": "Asistent AI",
    "trigger": "Studio AI → photo_video",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": "ai_media"
  },
  {
    "id": "flow-36",
    "title": "Istoric, consum și arhivare Studio",
    "group": "Asistent AI",
    "trigger": "Studio AI → istoric/consum lunar",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": "ai_media"
  },
  {
    "id": "flow-37",
    "title": "Aprobarea acțiunilor AI",
    "group": "Asistent AI",
    "trigger": "asistent AI → cerere de aprobare, fără execuție automată",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-38",
    "title": "Invită sau gestionează agent",
    "group": "Management",
    "trigger": "/app/team → invitație/editare agent",
    "access": "agency_admin / superadmin",
    "roles": [
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-39",
    "title": "Chat: contacte și conversații",
    "group": "Management",
    "trigger": "Messenger → contacte/conversație",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-40",
    "title": "Chat: blocare și notificări",
    "group": "Management",
    "trigger": "Messenger → opțiunile conversației",
    "access": "agent / agency_admin / superadmin",
    "roles": [
      "agent",
      "agency_admin",
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-41",
    "title": "Aprobă înscrierea agenției",
    "group": "Platformă",
    "trigger": "Agenții → cereri de înscriere",
    "access": "superadmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-42",
    "title": "Abonament, suspendare și locuri",
    "group": "Platformă",
    "trigger": "detaliu agenție → administrare abonament",
    "access": "superadmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-43",
    "title": "Ștergere agenție și mutare date",
    "group": "Platformă",
    "trigger": "dialogul de ștergere/transfer, înainte de confirmare",
    "access": "superadmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-44",
    "title": "Reasignare utilizator între agenții",
    "group": "Platformă",
    "trigger": "Utilizatori → ReassignUserDataSheet",
    "access": "superadmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-45",
    "title": "Acces temporar în cont",
    "group": "Platformă",
    "trigger": "cererea de impersonare, înainte de trimitere",
    "access": "superadmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-46",
    "title": "Activări și configurări portaluri",
    "group": "Platformă",
    "trigger": "Portaluri → cereri și carduri de configurare",
    "access": "superadmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-47",
    "title": "Limite lunare Studio AI",
    "group": "Platformă",
    "trigger": "Funcții AI → editorul limitelor pe agenție",
    "access": "superadmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-48",
    "title": "Email: conversații și răspuns",
    "group": "Platformă",
    "trigger": "Email → conversație/fereastră răspuns",
    "access": "superadmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-49",
    "title": "Email nou și atașamente",
    "group": "Platformă",
    "trigger": "Email → Email nou",
    "access": "superadmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-50",
    "title": "Email: ciorne și coș",
    "group": "Platformă",
    "trigger": "Email → Ciorne/Coș",
    "access": "superadmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-51",
    "title": "Căsuțe de email",
    "group": "Platformă",
    "trigger": "Email → Căsuțe de email",
    "access": "superadmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-52",
    "title": "Editor articol blog",
    "group": "Platformă",
    "trigger": "Blog → Articol nou/Editare",
    "access": "superadmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-53",
    "title": "Publicare și retragere articol",
    "group": "Platformă",
    "trigger": "Blog → confirmare publicare/retragere",
    "access": "superadmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-54",
    "title": "Încărcare manuală/bulk muzică",
    "group": "Platformă",
    "trigger": "Muzică video → încărcare",
    "access": "superadmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-55",
    "title": "Generare muzică AI",
    "group": "Platformă",
    "trigger": "Muzică video → Generează cu AI",
    "access": "superadmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-56",
    "title": "Activarea și editarea pieselor",
    "group": "Platformă",
    "trigger": "Muzică video → Editează piesa/activare",
    "access": "superadmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-57",
    "title": "Rezolvarea tichetelor",
    "group": "Platformă",
    "trigger": "Suport → conversație tichet",
    "access": "superadmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-58",
    "title": "Import nomenclator și locații portal",
    "group": "Platformă",
    "trigger": "Nomenclator → import și locații Imobiliare.ro",
    "access": "superadmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-59",
    "title": "Resetare QA",
    "group": "Platformă",
    "trigger": "QA/Demo → confirmare resetare",
    "access": "superadmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-60",
    "title": "Restaurare și ștergere definitivă",
    "group": "Audit",
    "trigger": "Elemente șterse → restaurare/ștergere definitivă",
    "access": "superadmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-61",
    "title": "Date piață",
    "group": "ACP",
    "trigger": "/app/acp/date-piata",
    "access": "superadmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-62",
    "title": "Import date de piață",
    "group": "ACP",
    "trigger": "Date piață → Import date de piață",
    "access": "superadmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-63",
    "title": "Potriviri ambigue de piață",
    "group": "ACP",
    "trigger": "Date piață → Potriviri ambigue",
    "access": "superadmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  },
  {
    "id": "flow-64",
    "title": "Detaliu ofertă de piață",
    "group": "ACP",
    "trigger": "/app/acp/date-piata/$id",
    "access": "superadmin",
    "roles": [
      "superadmin"
    ],
    "feature": null
  }
];
