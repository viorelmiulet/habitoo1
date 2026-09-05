import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, type LegalSection } from "@/components/marketing/LegalPage";
import { publicHead } from "@/components/marketing/public-head";

const TITLE = "Termeni și condiții — Habitoo CRM";
const DESCRIPTION =
  "Condițiile de utilizare a platformei Habitoo CRM: contul și agenția, responsabilitățile utilizatorilor, datele introduse, disponibilitatea serviciului și limitările.";

export const Route = createFileRoute("/termeni")({
  head: () =>
    publicHead({
      path: "/termeni",
      title: TITLE,
      description: DESCRIPTION,
    }),
  component: TermsPage,
});

const sections: LegalSection[] = [
  {
    title: "Serviciul",
    body: (
      <p>
        Habitoo CRM este o platformă online destinată agențiilor imobiliare, pentru gestionarea
        proprietăților, contactelor, cererilor, lead-urilor, activităților și rapoartelor. Serviciul este
        furnizat prin intermediul browserului, fără instalare.
      </p>
    ),
  },
  {
    title: "Contul și agenția",
    body: (
      <>
        <p>
          Pentru a folosi platforma, îți creezi un cont și o agenție sau ești invitat într-o agenție
          existentă. Persoana care creează agenția devine administratorul acesteia și poate invita
          alți utilizatori, atribuindu-le roluri.
        </p>
        <p>
          Ești responsabil pentru păstrarea confidențialității datelor de autentificare și pentru
          acțiunile efectuate din contul tău.
        </p>
      </>
    ),
  },
  {
    title: "Utilizare acceptabilă",
    body: (
      <>
        <p>Te angajezi să folosești platforma în conformitate cu legea și cu acești termeni. Nu este permis:</p>
        <ul>
          <li>să încerci să accesezi datele altor agenții sau ale altor utilizatori;</li>
          <li>să încarci conținut ilegal sau care încalcă drepturile unor terți;</li>
          <li>să afectezi funcționarea sau securitatea platformei.</li>
        </ul>
      </>
    ),
  },
  {
    title: "Datele introduse în platformă",
    body: (
      <p>
        Datele introduse de agenție (proprietăți, contacte, cereri, lead-uri, documente, fotografii)
        rămân în proprietatea agenției. Habitoo CRM le prelucrează doar pentru a furniza serviciul, așa
        cum este descris în Politica de confidențialitate.
      </p>
    ),
  },
  {
    title: "Disponibilitate și modificări",
    body: (
      <p>
        Depunem eforturi rezonabile pentru ca platforma să fie disponibilă continuu, însă pot exista
        întreruperi pentru mentenanță sau din cauze independente de noi. Funcționalitățile pot fi
        îmbunătățite sau modificate în timp; schimbările importante vor fi comunicate utilizatorilor.
      </p>
    ),
  },
  {
    title: "Limitarea răspunderii",
    body: (
      <p>
        Platforma este un instrument de organizare a activității; deciziile comerciale și relația cu
        clienții rămân în responsabilitatea agenției. În limitele permise de lege, nu răspundem pentru
        pierderi indirecte rezultate din utilizarea sau imposibilitatea utilizării serviciului.
      </p>
    ),
  },
  {
    title: "Contact și actualizări",
    body: (
      <p>
        Versiunea completă a termenilor, inclusiv condițiile comerciale, va fi publicată înainte de
        lansarea comercială. Pentru întrebări legate de acești termeni, folosește pagina de contact.
      </p>
    ),
  },
];

function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Termeni și condiții"
      intro="Regulile de bază pentru utilizarea platformei Habitoo CRM de către agenții și utilizatorii lor."
      sections={sections}
    />
  );
}
