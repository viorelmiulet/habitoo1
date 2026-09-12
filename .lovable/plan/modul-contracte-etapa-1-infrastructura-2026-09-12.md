# Modul Contracte — etapa 1 (infrastructura)

Construim scheletul complet și funcțional al modulului: șabloane, precompletare din act cu AI, generare PDF, semnare olografă la distanță, listă și acțiuni în aplicație. Conținutul juridic real al șabloanelor îl înlocuiești tu în etapa 2.

## 1. Șabloane

- Două niveluri: **șabloane Habitoo** (implicite, la nivel de platformă, gestionate de superadmin) și **șabloane de agenție**. Agenția pornește de la un șablon Habitoo cu acțiunea „Copiază și personalizează", apoi editează liber textul propriu. Da, are sens — altfel fiecare agenție ar începe de la zero, iar actualizările noastre nu ar ajunge nicăieri.
- Textul șablonului conține variabile de forma `{{proprietate.adresa}}`, `{{client.cnp}}`, `{{agentie.denumire}}`, `{{contract.comision}}` etc., cu listă vizibilă de variabile disponibile în editor.
- Trei șabloane generice de start: mandat de vânzare, mandat de închiriere, proces-verbal de vizionare.

## 2. Extragere date din act (AI)

- Utilizatorul încarcă poza/scanul actului; imaginea este trimisă direct la model, în memorie, **fără a fi salvată** în storage. Reținerea imaginii este posibilă doar prin bifă explicită a utilizatorului.
- Model: `google/gemini-3.8-flash` prin Lovable AI (aceeași familie Gemini Flash), deci **nu ai nevoie de nicio cheie nouă** în Secrets. Dacă preferi totuși cheia ta directă Google, spune-mi și o folosesc cu numele `GEMINI_API_KEY`.
- Răspuns JSON strict: nume, prenume, CNP, serie, număr, data eliberării, emitent, adresă, data nașterii.
- Rezultatul apare într-un formular de **verificare și corectare** — nimic nu intră în contract fără confirmarea utilizatorului. Extragere eșuată sau parțială = completare manuală, fără blocaj.

## 3. Protecția datelor

- Câmpurile sensibile (CNP, serie și număr act) se stochează **criptat cu AES-256-GCM**, refolosind exact mecanismul deja existent pentru credențialele de portal (cheie derivată din secret de server, decriptare doar pe server, valoarea nu apare niciodată în bundle-ul de client, în audit sau în loguri). Voi genera un secret nou dedicat `CONTRACT_PII_KEY`, ca să nu amestec scopurile cu cheia portalurilor.
- Acces: doar agentul care a creat contractul și administratorul agenției (RLS + verificări server-side).
- Audit la fiecare extragere și la fiecare afișare a datelor de act în clar.

## 4. Generare PDF

- PDF generat pe server cu bibliotecă pură JS (compatibilă cu runtime-ul nostru), cu font Unicode pentru diacritice.
- Aspect profesional: antet cu logo-ul agenției (același folosit la materiale), datele părților, corpul contractului, spații de semnătură.
- PDF-ul se salvează în bucketul privat de documente și apare atașat la proprietate și/sau contact.

## 5. Semnătură olografă la distanță

- La finalizare se generează câte un token de semnare per semnatar (vânzător, cumpărător, agent…): aleatoriu de 32 bytes, stocat doar ca hash SHA-256, de unică folosință, expirare 7 zile, invalidat după semnare.
- Linkul se trimite pe email; în plus poate fi copiat sau afișat ca QR pentru WhatsApp.
- Pagina publică de semnare (fără cont, optimizată pentru telefon): vizualizarea contractului complet, apoi semnătură cu degetul pe canvas.
- După semnare: semnătura se aplică pe PDF, se rețin marcaj de timp, IP și user agent ca dovadă, iar PDF-ul semnat se salvează ca versiune nouă.
- Stări: în așteptare / parțial semnat (cine a semnat, cine nu) / semnat complet. Notificare către agent la fiecare semnătură.

## 6. Locuri în aplicație

- Secțiune „Contracte" în meniu, cu listă filtrabilă după stare, proprietate și client.
- Buton de generare contract din pagina proprietății și din pagina lead/contact, cu date precompletate din context.
- Tab de administrare șabloane în Setări agenție (admin) și în Superadmin pentru șabloanele Habitoo.

## Nu construim acum

Fără semnătură electronică calificată (DocuSign etc.) și fără integrare ANAF sau alte sisteme externe.

## Detalii tehnice

- Migrare nouă: `contract_templates` (nivel platformă/agenție), `contracts` (stare, snapshot de date, legături proprietate/contact/lead), `contract_parties` (rol, date de act criptate, semnătură), `contract_signature_tokens` (hash, expirare, consum), `contract_documents` (versiuni PDF). GRANT + RLS pe fiecare tabel nou; policy-uri restrânse la creator + admin agenție.
- Server functions noi în `src/lib/contracts.functions.ts` + helperi `*.server.ts`; criptare în `src/lib/contracts/crypto.server.ts` pe modelul `portals/crypto.server.ts`.
- Rută publică de semnare fără autentificare, cu verificare de token în handler.
- Design conform tokenilor existenți: `panel`, `SectionCard`, `StatusBadge`, paleta navy/auriu.
- La final: `bunx tsgo --noEmit` și `bunx vitest run`, plus teste unitare pentru randarea variabilelor de șablon și pentru ciclul de viață al tokenului.
