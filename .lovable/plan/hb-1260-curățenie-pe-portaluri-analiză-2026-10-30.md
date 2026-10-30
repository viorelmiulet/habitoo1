# HB-1260 — curățenie pe portaluri (analiză)

Stare citită acum în baza de date (fără apeluri la portaluri): fișa este garsonieră, doar vânzare, 45.500 €. 13 portaluri sunt bifate. Ultimele joburi Imobiliare.ro (29.10 20:00, 30.10 05:52 și 05:53) sunt în eroare; nu există joburi în așteptare.

| Portal | Ce reține Habitoo | Problema |
|---|---|---|
| Imobiliare.ro | referința HB-1260-C (276153556, închiriere), publicat | HB-1260 / 276124434 (vânzare) nu mai e reținut nicăieri |
| Storia | SALE:4db016df, RENT:e2e3b7fb, link-ul afișat = RENT (J3UP) | anunțul RENT e live |
| Imospot | ambele oferte (34564 SALE, 37473 RENT); link-ul afișat = RENT | 37473 e live |
| La Cheie | doar HBT-…-RENT (69501) | anunțul SALE nu mai e reținut |
| VDI | același idintern 1260, conținut de închiriere | doar conținutul e greșit |
| PrimulAnunț | același HB-1260 | doar conținutul e greșit |
| ClickImob, Imobli, Locuit, HomePitch, iMove, Properstar, Catalog Facebook | preiau singure feedul | se corectează singure la următoarea preluare, datele din fișă fiind deja refăcute |

## 3. Ce s-ar întâmpla azi la „Publică”, „Retrimite” sau republicare

- **Imobiliare.ro: da, s-ar crea HB-1260-V.** Habitoo reține o singură referință (HB-1260-C, de închiriere), iar fișa e acum de vânzare. Regula de schimbare a tranzacției ar trece HB-1260-C în draft și ar face POST pe **HB-1260-V**, un al treilea anunț. Originalul 276124434 ar rămâne în draft.
- **Storia:** pentru vânzare folosește SALE:4db016df: îl reactivează dacă se poate, apoi îl actualizează. Dacă nu se mai poate reactiva, **creează un anunț nou**. Anunțul RENT rămâne live, pentru că o tranzacție care nu mai e în fișă nu se retrage.
- **Imospot:** trimite oferta HBT-…-SALE. Nu am verificat dacă Imospot o leagă de 34564 sau creează un anunț nou. 37473 rămâne live.
- **La Cheie:** PUT pe HBT-…-SALE, care creează sau actualizează anunțul (același cod). 69501 (RENT) rămâne live.
- **VDI / PrimulAnunț:** actualizare pe același anunț, cu datele corecte. Aici apăsarea pe „Publică” e chiar corecția potrivită.

**Cum blocăm până la curățenie** (nu există azi un blocaj pe o singură proprietate):
- **Din interfață, acum:** nimeni nu apasă „Publică” sau „Retrimite” pe HB-1260. HB-1260 se exclude din republicările în masă. Imobiliare.ro, Storia, Imospot și La Cheie **nu** se debifează, pentru că debifarea înseamnă retragere completă (vezi mai jos).
- **Cod (recomandat):** o blocare temporară pe proprietate (`portal_publish_hold`: proprietate, portal sau toate, motiv, cine a pus-o). Coada de joburi, „Publică”, „Retrimite” și republicarea refuză orice trimitere cât timp blocarea există, cu un mesaj clar. Retragerile rămân permise. Doar SuperAdmin pune și scoate blocarea.

## 1 și 2. Pe fiecare portal: retragere RENT, apoi readucerea originalului de vânzare

**Imobiliare.ro**
- *Cod (operațiune SuperAdmin unică):* trece 276153556 / HB-1260-C în draft. Apoi rescrie în Habitoo referința HB-1260 și oferta 276124434 (tranzacție vânzare). Apoi trimite actualizarea și publicarea pe HB-1260. Totul se trece în jurnal cu motivul „corecție incident”.
- *Din interfață:* draftul se poate face din contul Imobiliare.ro. Readucerea lui HB-1260 fără un anunț nou **nu** se poate face din Habitoo fără codul de mai sus.

**Storia**
- *Cod:* dezactivează doar RENT:e2e3b7fb și scoate-l din codul reținut. Link-ul se reface după anunțul SALE. Apoi, pe SALE:4db016df: reactivare și actualizare. Dacă Storia nu permite reactivarea, operațiunea se oprește (fără anunț nou) și cere decizia ta.
- *Din interfață:* „Retrage” dezactivează **ambele** anunțuri. Apoi „Publică” reactivează SALE, dar poate crea unul nou. Nu e recomandat.

**Imospot**
- *Cod:* DELETE pe 37473. Ofertele reținute se refac la doar 34564 (SALE), apoi PUT pe HBT-…-SALE. Înainte, un GET confirmă că PUT-ul ajunge la 34564.
- *Din interfață:* „Retrage” șterge ambele. Nu există o retragere pe o singură tranzacție.

**La Cheie**
- *Cod:* DELETE pe HBT-…-RENT (69501). Înainte, GET pe HBT-…-SALE ca să aflăm starea originalului, apoi PUT pe HBT-…-SALE (același cod, deci nu apare alt anunț). Codul reținut se rescrie la HBT-…-SALE.
- *Din interfață:* „Retrage” șterge ambele coduri. „Publică” după aceea ar repune doar SALE, tot pe același cod. Aceasta e singura cale fără cod nou, dacă accepți o scurtă perioadă în care anunțul nu e online.

**VDI.ro și PrimulAnunț**
- *Din interfață:* după ce sunt gata pașii de mai sus, „Publică” sau „Retrimite” doar pentru aceste două. Se actualizează aceleași anunțuri (1338048, HB-1260). Nu e nevoie de cod.

**Portalurile care preiau singure feedul:** nu e nevoie de nicio acțiune. Ce trebuie verificat: la următoarea preluare apar datele de vânzare.

## Ordinea propusă
1. Se pune blocarea (cod) sau, până atunci, regula de mai sus pentru interfață.
2. O operațiune SuperAdmin de corecție pentru HB-1260, cu modul de probă (fără trimiteri) arătat întâi. Ea retrage anunțurile RENT de pe Storia, Imospot, La Cheie și Imobiliare.ro și rescrie referințele originale.
3. După aprobarea ta: rularea reală, apoi „Publică” pe VDI și PrimulAnunț, apoi scoaterea blocării.

## Neverificat
- Starea reală pe portaluri a originalelor (276124434, SALE:4db016df, 34564, HBT-…-SALE pe La Cheie): fără apeluri, nu știu dacă se mai pot reactiva.
- Dacă Imospot leagă oferta HBT-…-SALE de 34564.
