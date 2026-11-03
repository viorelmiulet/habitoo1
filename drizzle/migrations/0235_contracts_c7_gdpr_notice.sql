INSERT INTO public.contract_templates (organization_id,kind,name,body,is_active,standard_code)
VALUES (NULL,'gdpr_notice','Notă de informare GDPR (șablon Habitoo)',$legal$NOTĂ DE INFORMARE PRIVIND PRELUCRAREA DATELOR CU CARACTER PERSONAL
Anexă la contractul încheiat la data de {{contract.data}}

1. Operatorul. {{agentie.denumire_legala}}, CUI {{agentie.cui}}, nr. de ordine în Registrul Comerțului {{agentie.registru}}, cu sediul în {{agentie.adresa}}, e-mail {{agentie.email}}, telefon {{agentie.telefon}} („Agenția”).

2. Ce date prelucrăm. Numele și prenumele, CNP-ul, tipul, seria și numărul actului de identitate, emitentul și data eliberării, data nașterii, cetățenia, domiciliul, telefonul și adresa de e-mail.

3. Sursa datelor. Datele provin de la dumneavoastră: din actul de identitate prezentat, din certificatul de atestare a domiciliului, dacă l-ați prezentat, și din informațiile comunicate direct. Dacă actul a fost fotografiat pentru completarea automată a contractului, imaginea este folosită doar pentru extragerea datelor și nu este păstrată.

4. Scopurile și temeiurile prelucrării.
a) încheierea și executarea contractului — art. 6 alin. (1) lit. b) din Regulamentul (UE) 2016/679 („GDPR”);
b) îndeplinirea obligațiilor legale ale Agenției, inclusiv cele contabile și, unde se aplică, cele de cunoaștere a clientelei prevăzute de Legea nr. 129/2019 — art. 6 alin. (1) lit. c) GDPR;
c) constatarea, exercitarea sau apărarea unor drepturi în justiție — art. 6 alin. (1) lit. f) GDPR.
CNP-ul este prelucrat în condițiile art. 4 din Legea nr. 190/2018.

5. Destinatarii datelor. Celelalte părți ale contractului; furnizorii care susțin activitatea Agenției, în calitate de persoane împuternicite (platforma CRM, găzduirea datelor, semnarea electronică, recunoașterea automată a textului din acte); autoritățile publice, atunci când legea o cere. Dacă un furnizor prelucrează date în afara Spațiului Economic European, transferul se face numai cu garanțiile prevăzute de capitolul V GDPR, de exemplu clauze contractuale standard.

6. Durata păstrării. Datele se păstrează pe durata contractului și apoi pe perioada impusă de lege, de regulă 5 ani de la încetarea relației contractuale.

7. Drepturile dumneavoastră. Aveți dreptul de acces, rectificare, ștergere, restricționare a prelucrării, opoziție și portabilitate a datelor, în condițiile GDPR, printr-o cerere trimisă la {{agentie.email}}. Aveți dreptul de a depune plângere la Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (www.dataprotection.ro).

8. Furnizarea datelor. Datele de identificare sunt necesare pentru încheierea contractului; fără ele contractul nu poate fi încheiat. Agenția nu ia decizii bazate exclusiv pe prelucrarea automată a datelor.

Am primit un exemplar al acestei note.$legal$,true,'c7_gdpr_notice')
ON CONFLICT DO NOTHING;