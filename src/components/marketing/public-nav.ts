export const publicNav = [
  { to: "/functionalitati", label: "Funcționalități" },
  { to: "/analiza-comparativa-de-piata", label: "ACP" },
  { to: "/preturi", label: "Prețuri" },
  { to: "/despre", label: "Despre" },
  { to: "/blog", label: "Blog" },
  { to: "/contact", label: "Contact" },
] as const;

export const footerColumns = [
  {
    title: "Produs",
    links: [
      { to: "/functionalitati", label: "Funcționalități" },
      { to: "/anunturi-proprietari", label: "Anunțuri de la proprietari" },
      { to: "/colaborare-intre-agentii", label: "Colaborare între agenții" },
      { to: "/integrari", label: "Integrări" },
      { to: "/preturi", label: "Prețuri" },
      { to: "/despre", label: "Despre" },
      { to: "/blog", label: "Blog" },
      { to: "/agentii", label: "Agenții partenere" },
      { to: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Cont",
    links: [
      { to: "/login", label: "Autentificare" },
      { to: "/register", label: "Creează agenție" },
      { to: "/forgot-password", label: "Am uitat parola" },
    ],
  },
  {
    title: "Legal",
    links: [
      { to: "/politica-de-confidentialitate", label: "Politica de confidențialitate" },
      { to: "/termeni", label: "Termeni și condiții" },
    ],
  },
] as const;
