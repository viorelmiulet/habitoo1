import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, type LegalSection } from "@/components/marketing/LegalPage";
import { publicHead } from "@/components/marketing/public-head";

const TITLE = "Termeni și condiții — Habitoo CRM";
const DESCRIPTION =
  "Termenii și condițiile de utilizare a platformei Habitoo CRM: înscrierea agențiilor, conturi și planuri, conținutul utilizatorilor, publicarea către portaluri, colaborarea între agenții și limitarea răspunderii.";

export const Route = createFileRoute("/termeni")({
  head: () => {
    const h = publicHead({ path: "/termeni", title: TITLE, description: DESCRIPTION });
    h.meta.push({ name: "robots", content: "index, follow" });
    return h;
  },
  component: TermsPage,
});

const sections: LegalSection[] = [
  {
    title: "Cine suntem",
    body: (
      <>
        <p>
          Habitoo este o platformă software (CRM) destinată agențiilor imobiliare, operată de
          [DENUMIRE LEGALĂ SRL], cu sediul în [ADRESĂ], înregistrată la Registrul Comerțului sub nr.
          [J__/____/____], CUI [RO________], denumită în continuare „Habitoo" sau „noi".
        </p>
        <p>Platforma este disponibilă la habitoo.ro și crm.habitoo.ro.</p>
      </>
    ),
  },
  {
    title: "Acceptarea termenilor",
    body: (
      <>
        <p>
          Prin crearea unui cont și utilizarea platformei, confirmi că ai citit, ai înțeles și
          accepți acești termeni. Dacă folosești platforma în numele unei agenții, confirmi că ai
          dreptul să angajezi acea agenție din punct de vedere contractual.
        </p>
        <p>Dacă nu ești de acord cu acești termeni, te rugăm să nu utilizezi platforma.</p>
      </>
    ),
  },
  {
    title: "Descrierea serviciului",
    body: (
      <>
        <p>
          Habitoo pune la dispoziția agențiilor imobiliare un sistem de gestiune a activității care
          include, fără a se limita la: administrarea portofoliului de proprietăți, gestionarea
          contactelor și a lead-urilor, programarea activităților, publicarea anunțurilor către
          portaluri imobiliare terțe și un modul de colaborare între agențiile înscrise pe
          platformă.
        </p>
        <p>
          Ne rezervăm dreptul de a modifica, adăuga sau elimina funcționalități, cu notificare
          prealabilă rezonabilă atunci când modificarea afectează semnificativ utilizarea
          serviciului.
        </p>
      </>
    ),
  },
  {
    title: "Conturi și înscriere",
    body: (
      <>
        <p>
          Crearea unui cont de agenție necesită completarea unei cereri de înscriere cu date reale
          de identificare (denumire comercială, denumire legală, CUI, număr de înregistrare la
          Registrul Comerțului). Cererea este supusă verificării și aprobării din partea noastră; ne
          rezervăm dreptul de a refuza o cerere fără obligația de a motiva refuzul.
        </p>
        <p>
          Administratorul agenției poate adăuga utilizatori suplimentari (agenți), în limita
          numărului permis de planul ales.
        </p>
        <p>
          Ești responsabil pentru păstrarea confidențialității datelor de autentificare și pentru
          toate activitățile desfășurate din contul tău. Ne anunți fără întârziere dacă suspectezi
          un acces neautorizat.
        </p>
      </>
    ),
  },
  {
    title: "Planuri și limite",
    body: (
      <p>
        Accesul la platformă se face în baza unui plan care determină, printre altele, numărul maxim
        de utilizatori ai agenției. Trecerea la un plan superior sau inferior se face la cerere.
      </p>
    ),
  },
  {
    title: "Conținutul tău",
    body: (
      <>
        <p>
          Rămâi proprietarul tuturor datelor pe care le introduci în platformă: proprietăți,
          fotografii, contacte, documente și orice alt conținut („Conținutul tău").
        </p>
        <p>
          Ne acorzi un drept limitat de a stoca, procesa și afișa Conținutul tău exclusiv în scopul
          furnizării serviciului — inclusiv transmiterea către portalurile imobiliare pe care le
          selectezi și, dacă activezi modulul de colaborare, afișarea proprietăților marcate
          explicit de tine către celelalte agenții participante.
        </p>
        <p>
          Garantezi că ai dreptul legal de a publica materialele încărcate, inclusiv fotografiile,
          și că deții mandatele necesare pentru proprietățile listate.
        </p>
      </>
    ),
  },
  {
    title: "Utilizare acceptabilă",
    body: (
      <>
        <p>Te obligi să nu utilizezi platforma pentru:</p>
        <ul>
          <li>
            publicarea de anunțuri false, înșelătoare sau pentru proprietăți asupra cărora nu deții
            drepturi;
          </li>
          <li>
            încărcarea de conținut care încalcă drepturi de autor sau alte drepturi ale terților;
          </li>
          <li>colectarea sau extragerea automată a datelor altor agenții;</li>
          <li>încercări de acces neautorizat la conturi, date sau infrastructură;</li>
          <li>orice activitate ilegală sau care contravine legislației aplicabile.</li>
        </ul>
        <p>
          Încălcarea acestor reguli poate duce la suspendarea sau închiderea contului, fără
          rambursare.
        </p>
      </>
    ),
  },
  {
    title: "Publicarea către portaluri terțe",
    body: (
      <>
        <p>
          Platforma permite transmiterea anunțurilor către portaluri imobiliare terțe. Aceste
          portaluri sunt servicii independente, cu proprii termeni și proprii politici de moderare.
        </p>
        <p>
          Nu garantăm că un anunț transmis va fi acceptat, publicat sau menținut de un portal terț,
          și nu răspundem pentru modul în care acesta îl afișează, îl modifică sau îl retrage.
          Disponibilitatea unei integrări poate înceta dacă portalul terț își modifică sau își
          întrerupe interfața.
        </p>
      </>
    ),
  },
  {
    title: "Modulul de colaborare",
    body: (
      <>
        <p>
          Colaborarea este o funcționalitate opțională, disponibilă exclusiv între agențiile
          înscrise pe platformă. Participarea se activează și se dezactivează de către fiecare
          agenție.
        </p>
        <p>
          Doar proprietățile marcate explicit pentru colaborare devin vizibile celorlalte agenții
          participante. Datele confidențiale — proprietarul, datele lui de contact și notele interne
          — nu sunt expuse.
        </p>
        <p>
          Comisionul de colaborare afișat reprezintă oferta agenției care deține mandatul. Habitoo
          nu este parte în acordul dintre agenții, nu intermediază plata comisionului și nu răspunde
          pentru executarea sau neexecutarea acestuia. Orice dispută se soluționează direct între
          agențiile implicate.
        </p>
      </>
    ),
  },
  {
    title: "Disponibilitate",
    body: (
      <p>
        Depunem eforturi rezonabile pentru ca platforma să fie disponibilă continuu, dar nu garantăm
        funcționarea neîntreruptă sau lipsită de erori. Pot exista întreruperi pentru mentenanță,
        actualizări sau din cauze independente de noi.
      </p>
    ),
  },
  {
    title: "Limitarea răspunderii",
    body: (
      <>
        <p>
          Platforma este furnizată „ca atare". În limitele permise de lege, nu răspundem pentru
          pierderi de profit, pierderi de oportunități comerciale, pierderi de date rezultate din
          utilizarea sau imposibilitatea utilizării platformei, sau pentru decizii comerciale luate
          pe baza informațiilor din platformă.
        </p>
        <p>
          Nimic din acești termeni nu limitează răspunderea în cazurile în care legea nu permite o
          astfel de limitare.
        </p>
      </>
    ),
  },
  {
    title: "Suspendare și încetare",
    body: (
      <>
        <p>Poți înceta utilizarea platformei oricând, solicitând închiderea contului.</p>
        <p>
          Putem suspenda sau închide un cont în caz de încălcare a acestor termeni, de utilizare
          abuzivă, sau la cererea unei autorități competente.
        </p>
        <p>
          La încetare, datele agenției pot fi șterse definitiv. Îți recomandăm să îți exporți datele
          înainte de închiderea contului.
        </p>
      </>
    ),
  },
  {
    title: "Modificarea termenilor",
    body: (
      <p>
        Putem actualiza acești termeni. Modificările substanțiale vor fi anunțate prin platformă sau
        pe email, cu un preaviz rezonabil. Continuarea utilizării după intrarea în vigoare a
        modificărilor înseamnă acceptarea lor.
      </p>
    ),
  },
  {
    title: "Legea aplicabilă",
    body: (
      <p>
        Acești termeni sunt guvernați de legea română. Eventualele litigii se soluționează pe cale
        amiabilă, iar în caz contrar de instanțele competente din România.
      </p>
    ),
  },
  {
    title: "Contact",
    body: (
      <p>
        Pentru orice întrebare legată de acești termeni:{" "}
        <a
          href="mailto:contact@habitoo.ro"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          contact@habitoo.ro
        </a>
      </p>
    ),
  },
];

function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Termeni și condiții"
      intro="Condițiile de utilizare a platformei Habitoo CRM de către agențiile imobiliare și utilizatorii acestora."
      lastUpdated="7 septembrie 2026"
      sections={sections}
    />
  );
}
