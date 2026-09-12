/**
 * TUR GHIDAT ÎN APLICAȚIE — definiția pașilor.
 *
 * Fiecare pas poate avea o rută (turul navighează singur acolo) și una sau mai
 * multe selectoare `data-tour`. Dacă niciun element nu există (ecran mic,
 * portofoliu gol), pasul se afișează centrat, cu nota explicativă, fără
 * evidențiere — turul nu se blochează niciodată.
 */
export type TourStep = {
  id: string;
  title: string;
  text: string;
  /** Ruta pe care turul navighează înainte de a căuta elementul. */
  route?: string;
  /** Selectoare încercate în ordine. */
  selectors?: string[];
  /** Text afișat doar când elementul nu a fost găsit. */
  fallbackNote?: string;
};

export function tourStepsFor(role: "agent" | "agency_admin"): TourStep[] {
  const steps: TourStep[] = [
    {
      id: "welcome",
      title: "Bun venit în Habitoo CRM!",
      text: "În mai puțin de un minut îți arăt unde stau proprietățile, publicarea pe portaluri, lead-urile și ajutorul. Poți sări peste oricând.",
      route: "/app",
    },
    {
      id: "dashboard",
      title: "Dashboardul tău",
      text: "Aici vezi ce ai de făcut azi: programări, follow-up-uri restante și lead-uri necontactate. E prima pagină pe care o deschizi dimineața.",
      route: "/app",
      selectors: ['[data-tour="dashboard-today"]', '[data-tour="dashboard-overview"]'],
    },
    {
      id: "add-property",
      title: "Adaugă o proprietate",
      text: "De aici pornești un anunț nou. Formularul e împărțit pe secțiuni: detalii, preț, locație pe hartă și fotografii.",
      route: "/app/properties",
      selectors: ['[data-tour="property-add"]'],
    },
    {
      id: "publish",
      title: "Publicarea pe portaluri",
      text: "În pagina unei proprietăți, fila Publicare are un singur buton „Publică”: bifezi portalurile dorite (unele merg în pereche, pe aceeași cheie) și anunțul pleacă peste tot.",
      route: "/app/properties",
      selectors: ['[data-tour="property-portals"]'],
      fallbackNote:
        "Nu ai încă nicio proprietate — coloana de portaluri apare aici imediat ce adaugi prima.",
    },
    {
      id: "collaboration",
      title: "Colaborare între agenții",
      text: "Deschizi o proprietate colaborării și alte agenții îți pot aduce cumpărători, cu comisionul stabilit de tine.",
      route: "/app/properties",
      selectors: ['[data-tour="nav:/app/collaboration"]'],
      fallbackNote: "Găsești Colaborare în meniul din stânga, la secțiunea Rețea.",
    },
    {
      id: "pipeline",
      title: "Lead-uri și pipeline",
      text: "Fiecare lead stă pe o coloană, iar tu îl tragi cu mouse-ul dintr-o etapă în alta pe măsură ce discuția avansează.",
      route: "/app/leads",
      selectors: ['[data-tour="leads-pipeline"]'],
      fallbackNote: "Când ai primul lead, îl vei putea trage între etapele pipeline-ului.",
    },
    {
      id: "support",
      title: "Ajutor și suport",
      text: "Butonul de ajutor deschide un tichet către echipa Habitoo, iar răspunsul îți vine direct în aplicație, la „Tichetele mele”.",
      route: "/app/leads",
      selectors: ['[data-tour="support-button"]'],
      fallbackNote: "Butonul de ajutor e în bara de sus, lângă notificări.",
    },
  ];

  if (role === "agency_admin") {
    steps.push({
      id: "team",
      title: "Agenți și locuri în plan",
      text: "Aici adaugi colegii și vezi câte locuri mai ai în planul agenției. Planul se schimbă doar de echipa Habitoo, la cerere.",
      route: "/app/team",
      selectors: ['[data-tour="team-seats"]'],
      fallbackNote: "Locurile din plan apar în pagina Agenți.",
    });
  }

  return steps;
}
