import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, type LegalSection } from "@/components/marketing/LegalPage";
import { publicHead } from "@/components/marketing/public-head";

const TITLE = "Politica de confidențialitate — Habitoo CRM";
const DESCRIPTION =
  "Cum tratează Habitoo CRM datele conturilor, ale agențiilor și ale persoanelor introduse în CRM: scop, separare per agenție, acces pe roluri și drepturile utilizatorilor.";

export const Route = createFileRoute("/confidentialitate")({
  head: () =>
    publicHead({
      path: "/confidentialitate",
      title: TITLE,
      description: DESCRIPTION,
    }),
  component: PrivacyPage,
});

const sections: LegalSection[] = [
  {
    title: "Ce date prelucrăm",
    body: (
      <>
        <p>În funcție de modul în care folosești platforma, prelucrăm următoarele categorii de date:</p>
        <ul>
          <li>Date de cont: nume, adresă de email, parolă (stocată criptat) sau identitatea furnizată de Google la autentificare.</li>
          <li>Date despre agenție: denumire, date de contact și setări ale spațiului de lucru.</li>
          <li>Date introduse de agenție în CRM: proprietăți, contacte, cereri, lead-uri, activități, documente și fotografii.</li>
          <li>Date tehnice necesare funcționării: jurnale de securitate și de audit, informații despre sesiune.</li>
        </ul>
      </>
    ),
  },
  {
    title: "Scopul prelucrării",
    body: (
      <p>
        Datele sunt prelucrate exclusiv pentru a furniza serviciul Habitoo CRM: autentificare, organizarea
        activității agenției, funcționarea modulelor (proprietăți, contacte, cereri, lead-uri, matching,
        activități, rapoarte), notificări în aplicație, securitate și asistență.
      </p>
    ),
  },
  {
    title: "Separarea datelor per agenție",
    body: (
      <p>
        Fiecare agenție are propriul spațiu de lucru. Datele unei agenții nu sunt vizibile altor agenții.
        Accesul în interiorul agenției este controlat prin roluri (administrator de agenție și agent), iar
        modificările importante sunt înregistrate în jurnalul de audit.
      </p>
    ),
  },
  {
    title: "Responsabilitatea agenției pentru datele clienților",
    body: (
      <p>
        Agenția care folosește Habitoo CRM decide ce date despre clienții și partenerii săi introduce în
        platformă și răspunde de temeiul legal al acestei prelucrări. Habitoo CRM prelucrează aceste date
        în numele agenției, doar în scopul furnizării serviciului.
      </p>
    ),
  },
  {
    title: "Drepturile tale",
    body: (
      <>
        <p>Pentru datele care te privesc ai dreptul de a solicita:</p>
        <ul>
          <li>acces la date și informații despre modul în care sunt prelucrate;</li>
          <li>rectificarea datelor inexacte;</li>
          <li>ștergerea datelor, în limitele obligațiilor legale;</li>
          <li>restricționarea prelucrării sau opoziția la aceasta;</li>
          <li>portabilitatea datelor, acolo unde este aplicabilă.</li>
        </ul>
        <p>Solicitările se pot transmite prin pagina de contact.</p>
      </>
    ),
  },
  {
    title: "Securitate",
    body: (
      <p>
        Aplicăm măsuri tehnice și organizatorice adecvate: autentificare securizată, comunicații criptate,
        control al accesului pe roluri, separarea datelor între agenții și jurnalizarea acțiunilor importante.
      </p>
    ),
  },
  {
    title: "Actualizări ale politicii",
    body: (
      <p>
        Această politică poate fi actualizată pe măsură ce platforma evoluează. Versiunea completă, cu
        datele de identificare ale operatorului și detaliile privind perioadele de păstrare, va fi
        publicată înainte de lansarea comercială.
      </p>
    ),
  },
];

function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Politica de confidențialitate"
      intro="Această pagină descrie ce date prelucrează Habitoo CRM, în ce scop și cum sunt protejate."
      sections={sections}
    />
  );
}
