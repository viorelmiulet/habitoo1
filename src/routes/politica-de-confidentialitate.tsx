import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, type LegalSection } from "@/components/marketing/LegalPage";
import { publicHead } from "@/components/marketing/public-head";

const TITLE = "Politica de confidențialitate — Habitoo CRM";
const DESCRIPTION =
  "Politica de confidențialitate Habitoo CRM: ce date cu caracter personal prelucrăm, scopurile și temeiurile legale, transmiterea către terți, perioadele de păstrare și drepturile tale conform GDPR.";

export const Route = createFileRoute("/politica-de-confidentialitate")({
  head: () => {
    const h = publicHead({ path: "/politica-de-confidentialitate", title: TITLE, description: DESCRIPTION });
    h.meta.push({ name: "robots", content: "index, follow" });
    return h;
  },
  component: PrivacyPage,
});

const sections: LegalSection[] = [
  {
    title: "Introducere",
    body: (
      <>
        <p>
          Această politică explică ce date cu caracter personal prelucrăm, în ce scop și ce drepturi
          ai. Se aplică platformei Habitoo (habitoo.ro și crm.habitoo.ro).
        </p>
        <p>
          Operator de date: MVA PERFECT BUSINESS S.R.L., sediul social în jud. Ilfov, sat Dudu,
          comuna Chiajna, strada Tineretului nr. 35BIS, camera 1, bl. 2, scara 2, etaj 2, ap. 26,
          înregistrată la Registrul Comerțului sub nr. J2024018361001, CUI 50477503, email{" "}
          <a
            href="mailto:contact@habitoo.ro"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            contact@habitoo.ro
          </a>
          .
        </p>
      </>
    ),
  },
  {
    title: "Două roluri diferite",
    body: (
      <>
        <p>Prelucrăm date în două calități distincte, cu responsabilități diferite:</p>
        <p>
          <strong>Ca operator</strong> — pentru datele utilizatorilor platformei (administratori de
          agenție și agenți): datele de cont, datele de facturare, datele de utilizare a platformei.
        </p>
        <p>
          <strong>Ca persoană împuternicită</strong> — pentru datele pe care agențiile le introduc
          despre clienții lor (contacte, lead-uri, proprietari). Aceste date aparțin agenției, care
          decide scopul și mijloacele prelucrării. Noi le prelucrăm exclusiv la instrucțiunea
          agenției, în scopul furnizării serviciului. Fiecare agenție rămâne operator față de
          propriii clienți și este responsabilă pentru temeiul legal al colectării acestor date.
        </p>
      </>
    ),
  },
  {
    title: "Ce date prelucrăm",
    body: (
      <>
        <p>
          <strong>Date de cont:</strong> nume, email, telefon, funcția în agenție, fotografie de
          profil (opțională).
        </p>
        <p>
          <strong>Date despre agenție:</strong> denumire comercială, denumire legală, CUI, număr de
          înregistrare la Registrul Comerțului, adresă, date de contact.
        </p>
        <p>
          <strong>Date introduse de agenție:</strong> informații despre proprietăți, contacte,
          lead-uri, activități, documente încărcate.
        </p>
        <p>
          <strong>Date tehnice:</strong> adresă IP, tip de dispozitiv și browser, jurnale de acces
          și de activitate în platformă, necesare pentru securitate și depanare.
        </p>
        <p>
          <strong>Comunicări:</strong> mesajele trimise prin formularul de contact sau prin sistemul
          de tichete de suport.
        </p>
      </>
    ),
  },
  {
    title: "Scopurile și temeiurile prelucrării",
    body: (
      <table>
        <thead>
          <tr>
            <th scope="col">Scop</th>
            <th scope="col">Temei legal</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Crearea și administrarea contului</td>
            <td>Executarea contractului</td>
          </tr>
          <tr>
            <td>Furnizarea funcționalităților platformei</td>
            <td>Executarea contractului</td>
          </tr>
          <tr>
            <td>Verificarea cererilor de înscriere a agențiilor</td>
            <td>Interes legitim (prevenirea abuzului)</td>
          </tr>
          <tr>
            <td>Securitate, jurnale de audit, prevenirea fraudei</td>
            <td>Interes legitim</td>
          </tr>
          <tr>
            <td>Suport tehnic</td>
            <td>Executarea contractului</td>
          </tr>
          <tr>
            <td>Facturare și obligații contabile</td>
            <td>Obligație legală</td>
          </tr>
          <tr>
            <td>Comunicări comerciale</td>
            <td>Consimțământ (revocabil oricând)</td>
          </tr>
        </tbody>
      </table>
    ),
  },
  {
    title: "Transmiterea către terți",
    body: (
      <>
        <p>Transmitem date către:</p>
        <p>
          <strong>Portaluri imobiliare</strong> — doar datele anunțurilor pe care le selectezi
          explicit pentru publicare, inclusiv datele de contact ale agentului responsabil. Fiecare
          portal are propria politică de confidențialitate.
        </p>
        <p>
          <strong>Alte agenții Habitoo</strong> — doar dacă activezi modulul de colaborare și doar
          pentru proprietățile marcate explicit. Datele proprietarului nu sunt transmise.
        </p>
        <p>
          <strong>Furnizori de servicii</strong> — găzduire, bază de date, trimitere de emailuri.
          Aceștia prelucrează datele exclusiv la instrucțiunea noastră, în baza unor acorduri de
          prelucrare.
        </p>
        <p>
          <strong>Autorități</strong> — când există o obligație legală.
        </p>
        <p>Nu vindem date cu caracter personal.</p>
      </>
    ),
  },
  {
    title: "Localizarea datelor",
    body: (
      <p>
        Datele sunt stocate pe servere din Uniunea Europeană. Dacă un furnizor prelucrează date în
        afara UE, ne asigurăm că există garanții adecvate conform GDPR (clauze contractuale standard
        sau decizie de adecvare).
      </p>
    ),
  },
  {
    title: "Cât păstrăm datele",
    body: (
      <>
        <p>Datele de cont: pe durata contractului și 30 de zile după închiderea contului.</p>
        <p>
          Datele introduse de agenție: pe durata contractului. La ștergerea definitivă a unei
          agenții, datele asociate sunt eliminate ireversibil.
        </p>
        <p>Documentele contabile: 10 ani, conform legislației fiscale.</p>
        <p>Jurnalele de audit și securitate: până la 24 de luni.</p>
      </>
    ),
  },
  {
    title: "Drepturile tale",
    body: (
      <>
        <p>
          Ai dreptul de acces, rectificare, ștergere, restricționare a prelucrării, portabilitate,
          opoziție și retragere a consimțământului.
        </p>
        <p>
          Îți poți exercita aceste drepturi scriind la{" "}
          <a
            href="mailto:contact@habitoo.ro"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            contact@habitoo.ro
          </a>
          . Răspundem în cel mult 30 de zile.
        </p>
        <p>
          Dacă datele tale au fost introduse în platformă de o agenție (ești clientul acesteia),
          adresează-te direct agenției respective — ea este operatorul acelor date. Îți putem indica
          agenția în cauză dacă este necesar.
        </p>
        <p>
          Ai dreptul de a depune plângere la Autoritatea Națională de Supraveghere a Prelucrării
          Datelor cu Caracter Personal (dataprotection.ro).
        </p>
      </>
    ),
  },
  {
    title: "Securitate",
    body: (
      <>
        <p>
          Aplicăm măsuri tehnice și organizatorice adecvate: criptare în tranzit, separarea strictă
          a datelor între agenții, control al accesului pe roluri, jurnalizarea acțiunilor sensibile
          și copii de siguranță periodice.
        </p>
        <p>
          Niciun sistem nu este complet invulnerabil; în caz de breșă de securitate cu risc pentru
          drepturile persoanelor, notificăm autoritatea și persoanele vizate conform obligațiilor
          legale.
        </p>
      </>
    ),
  },
  {
    title: "Cookie-uri",
    body: (
      <>
        <p>
          Folosim cookie-uri și tehnologii similare pe trei categorii:{" "}
          <strong>strict necesare</strong> (autentificare, menținerea sesiunii, securitatea
          formularelor și memorarea preferinței tale de consimțământ) — acestea nu pot fi
          dezactivate fără a afecta funcționarea platformei; <strong>analiză</strong> și{" "}
          <strong>marketing</strong> — dezactivate implicit și folosite numai dacă îți dai acordul
          explicit. În acest moment nu folosim cookie-uri de analiză sau de marketing.
        </p>
        <p>
          Pe site-ul public poți accepta toate categoriile, le poți refuza (păstrând doar cele
          strict necesare) sau poți alege individual din panoul „Personalizează”. Alegerea este
          salvată local, în browserul tău (localStorage), împreună cu data și versiunea politicii;
          dacă schimbăm categoriile, îți vom cere din nou acordul. Îți poți retrage sau modifica
          acordul oricând din linkul „Preferințe cookie-uri” din footerul site-ului, la fel de
          simplu cum l-ai acordat.
        </p>
        <p>
          În aplicația CRM (contul autentificat) folosim exclusiv cookie-uri strict necesare pentru
          autentificare și securitate, motiv pentru care acolo nu se afișează bannerul de
          consimțământ.
        </p>
      </>
    ),
  },
  {
    title: "Minori",
    body: (
      <p>
        Platforma este destinată exclusiv utilizării profesionale și nu se adresează persoanelor sub
        16 ani.
      </p>
    ),
  },
  {
    title: "Modificări",
    body: (
      <p>
        Putem actualiza această politică. Modificările substanțiale vor fi anunțate prin platformă
        sau pe email.
      </p>
    ),
  },
  {
    title: "Contact",
    body: (
      <p>
        Pentru orice întrebare privind prelucrarea datelor:{" "}
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

function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Politica de confidențialitate"
      intro="Ce date cu caracter personal prelucrăm, în ce scop și ce drepturi ai, conform GDPR."
      lastUpdated="7 septembrie 2026"
      sections={sections}
    />
  );
}
