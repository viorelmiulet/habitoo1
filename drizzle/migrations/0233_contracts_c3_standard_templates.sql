ALTER TABLE public.contract_templates ADD COLUMN standard_code text;
CREATE UNIQUE INDEX contract_templates_standard_code_uidx ON public.contract_templates(standard_code) WHERE organization_id IS NULL AND standard_code IS NOT NULL;
INSERT INTO public.contract_templates (organization_id,kind,name,body,is_active,standard_code) SELECT NULL,seed.kind,seed.name,seed.body,true,'c3_'||seed.kind FROM (VALUES
('commission', 'Contract de comision (șablon Habitoo)', $legal$CONTRACT DE COMISION
{{contract.serie_numar}} din {{contract.data}}

Art. 1. Părțile
1.1. {{agentie.denumire_legala}}, cu sediul în {{agentie.adresa}}, CUI {{agentie.cui}}, înregistrată la Registrul Comerțului sub nr. {{agentie.registru}}, reprezentată de {{agentie.reprezentant}}, în calitate de intermediar, și
1.2. {{client.nume}}, CNP {{client.cnp}}, domiciliat în {{client.adresa}}, identificat cu {{client.act_tip}} seria {{client.serie}} nr. {{client.numar}}, eliberat de {{client.emitent}} la {{client.data_eliberarii}}, telefon {{client.telefon}}, în calitate de client ({{contract.calitate_client}}),
au încheiat prezentul contract de intermediere, cu respectarea art. 2096 și următoarele din Codul civil.

Art. 2. Obiectul contractului
2.1. Intermediarul îl pune pe client în legătură cu persoane interesate de {{contract.tip_tranzactie}} privind imobilul {{proprietate.tip}} situat în {{proprietate.adresa}} (referința {{proprietate.referinta}}) sau, după caz, îi prezintă imobile potrivite cerințelor sale.
2.2. Intermediarul promovează imobilul, organizează vizionările, oferă consultanță în negociere și în pregătirea documentelor tranzacției.

Art. 3. Durata
3.1. Contractul se încheie pe {{contract.durata_luni}} luni de la semnare.
3.2. Contractul nu acordă exclusivitate. Pentru exclusivitate se folosește contractul de reprezentare exclusivă.

Art. 4. Comisionul
4.1. Pentru serviciile prestate, clientul plătește intermediarului un comision de {{contract.comision}}.
4.2. Comisionul devine exigibil la {{contract.moment_plata_comision}} și se plătește în aceeași zi, pe bază de factură.
4.3. Comisionul este datorat și dacă, în {{contract.luni_protectie}} luni de la încetarea contractului, clientul încheie tranzacția cu o persoană prezentată de intermediar, direct sau prin alt intermediar.

Art. 5. Obligațiile intermediarului
5.1. Să informeze clientul cu bună-credință asupra ofertelor și persoanelor interesate.
5.2. Să păstreze confidențialitatea datelor clientului și să le prelucreze potrivit legii.

Art. 6. Obligațiile clientului
6.1. Să furnizeze informații și documente reale despre imobil și despre situația lui juridică.
6.2. Să anunțe intermediarul dacă imobilul nu mai este disponibil.
6.3. Să plătească comisionul în condițiile art. 4.

Art. 7. Dispoziții finale
7.1. Contractul poate înceta înainte de termen prin acordul scris al părților.
7.2. Litigiile se rezolvă pe cale amiabilă, iar în caz contrar de instanțele competente.
7.3. Contractul s-a încheiat în {{contract.exemplare}} exemplare, la {{contract.localitate}}, în data de {{contract.data}}.$legal$),
('loan_for_use', 'Contract de comodat (șablon Habitoo)', $legal$CONTRACT DE COMODAT
încheiat astăzi, {{contract.data}}

Art. 1. Părțile
1.1. {{comodant.nume}}, CNP {{comodant.cnp}}, domiciliat în {{comodant.adresa}}, identificat cu {{comodant.act_tip}} seria {{comodant.serie}} nr. {{comodant.numar}}, eliberat de {{comodant.emitent}} la {{comodant.data_eliberarii}}, în calitate de comodant (proprietar), și
1.2. {{comodatar.nume}}, CNP {{comodatar.cnp}}, domiciliat în {{comodatar.adresa}}, identificat cu {{comodatar.act_tip}} seria {{comodatar.serie}} nr. {{comodatar.numar}}, eliberat de {{comodatar.emitent}} la {{comodatar.data_eliberarii}}, în calitate de comodatar,
au încheiat prezentul contract de comodat (împrumut de folosință), cu respectarea art. 2146 și următoarele din Codul civil.

Art. 2. Obiectul contractului
2.1. Comodantul dă comodatarului, cu titlu gratuit, folosința imobilului {{proprietate.tip}} situat în {{proprietate.adresa}}, înscris în cartea funciară nr. {{proprietate.cf}}, număr cadastral {{proprietate.cadastral}}.
2.2. Imobilul se folosește ca {{contract.scop_folosinta}}.

Art. 3. Durata
3.1. Folosința se acordă {{contract.durata_text}}, începând cu {{contract.data_inceput}}.

Art. 4. Obligațiile comodatarului
4.1. Să păstreze și să folosească imobilul cu prudență și diligență, numai potrivit destinației stabilite.
4.2. Să suporte cheltuielile de folosință (utilități și întreținere) pe durata contractului, dacă părțile nu convin altfel în scris.
4.3. Să nu permită folosința imobilului de către terți fără acordul scris al comodantului.
4.4. Să restituie imobilul la încetarea contractului, în starea în care l-a primit, cu excepția uzurii normale.

Art. 5. Încetarea contractului
5.1. Contractul încetează la expirarea duratei, prin acordul părților sau la cererea comodantului, în cazurile prevăzute de Codul civil.
5.2. Dacă scopul folosinței este sediul social sau punctul de lucru, comodatarul radiază sau mută sediul în cel mult 30 de zile de la încetare.

Art. 6. Dispoziții finale
6.1. Litigiile se rezolvă pe cale amiabilă, iar în caz contrar de instanțele competente.
6.2. Contractul s-a încheiat în {{contract.exemplare}} exemplare, la {{contract.localitate}}, în data de {{contract.data}}.$legal$),
('viewing', 'Contract de vizionare (șablon Habitoo)', $legal$CONTRACT DE VIZIONARE
{{contract.serie_numar}} din {{contract.data}}

Art. 1. Părțile
1.1. {{agentie.denumire_legala}}, cu sediul în {{agentie.adresa}}, CUI {{agentie.cui}}, reprezentată prin agentul {{agent.nume}}, în calitate de agenție, și
1.2. {{client.nume}}, CNP {{client.cnp}}, domiciliat în {{client.adresa}}, identificat cu {{client.act_tip}} seria {{client.serie}} nr. {{client.numar}}, telefon {{client.telefon}}, în calitate de client.

Art. 2. Imobilele vizionate
2.1. La data de {{contract.data_vizionare}}, agenția i-a prezentat clientului, în vederea {{contract.tip_tranzactie}}, următoarele imobile:

{{vizionare.tabel}}

2.2. Clientul confirmă că a aflat de aceste imobile și de datele proprietarilor lor prin intermediul agenției.

Art. 3. Comisionul
3.1. Dacă clientul, soțul/soția, o rudă de gradul I sau o firmă controlată de el încheie o tranzacție privind oricare dintre imobilele de la art. 2, clientul datorează agenției un comision de {{contract.comision}}.
3.2. Comisionul este datorat dacă tranzacția se încheie în {{contract.luni_protectie}} luni de la vizionare, inclusiv direct cu proprietarul sau prin altă agenție.
3.3. Comisionul devine exigibil la semnarea antecontractului sau, în lipsa lui, a contractului de {{contract.tip_tranzactie}}.

Art. 4. Confidențialitate
4.1. Clientul nu comunică terților datele imobilelor și ale proprietarilor primite de la agenție.

Art. 5. Dispoziții finale
5.1. Litigiile se rezolvă pe cale amiabilă, iar în caz contrar de instanțele competente.
5.2. Contractul s-a încheiat în {{contract.exemplare}} exemplare, la {{contract.localitate}}, în data de {{contract.data}}.$legal$)
) AS seed(kind,name,body) ON CONFLICT DO NOTHING;