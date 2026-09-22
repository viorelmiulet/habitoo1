# Romimo — raport de legare la interfață și pașii rămași

## Ce am verificat în cod și în bază

**1. Cum se declanșează publicarea (ex. Imospot)**
Fluxul este complet generic, fără cablaj per portal:

```text
fila „Publicare” (PropertyPortalsCard) → bifă portal + butonul „Publică”
  → applyPropertyPortalSelection (server)
    → applyPortalSelectionForOrg  (verifică activare, locuri, configurare)
      → executeListingAction      (validare pre-publicare, rate limit, jurnal)
        → adapter.publishListing / updateListing / withdrawListing
```

Lista de portaluri din filă se construiește automat din registry: toate portalurile
neacoperite de un grup și activate pentru agenție. Singurele bucăți specifice sunt
cosmetice (reînnoirea automată Storia, promovările Imobiliare.ro).

**2. `allowLiveRequests`**
Nu e variabilă de mediu și nu e globală: e per agenție și per portal, din
`portal_connections.settings.allow_live`. Comutatorul „Activat pentru agenție” din
Superadmin scrie `activated` și `allow_live` împreună (ON = ambele true, OFF = ambele false).
Pentru agenția din contul de test (numele afișat „Test api”, slug `mva-imobiliare--196ade`)
nu există încă niciun rând pentru Romimo, deci acum ar fi `false`; toate celelalte
portaluri ale ei au `allow_live = true`.

**3. Buton „Test conexiune”**
Există deja, generic, în Superadmin → Portaluri („Testează conexiunea”) și apelează
`adapter.testConnection`. Funcționează pentru Romimo fără modificări. Contează: testul
reușit pune conexiunea pe „connected”, iar publicarea cere exact această stare.

**4. Mai multe motive de refuz**
Adaptorul Romimo unește toate motivele într-un singur mesaj („Anunțul nu poate fi trimis
la Romimo: motiv1, motiv2.”). Interfața afișează mesajul întreg: în notificarea de după
„Publică” și în rândul portalului. Validarea generică pre-publicare se comportă identic
(„completează: câmp1, câmp2”). Deci toate motivele se văd, nu doar primul.

**5. Retragere**
Nu există buton separat: se debifează portalul și se apasă „Publică”; trecerea
bifat → debifat apelează retragerea reală pe portal. Retragerea se declanșează și la
arhivarea ofertei sau la reducerea locurilor de publicare.

## Concluzie: ce merge deja fără nicio modificare de UI

- apariția Romimo în fila „Publicare” și în Superadmin → Portaluri, cu label-ul actual;
- formularul de configurare (ApiKey + email cont), testul conexiunii, publicarea,
  actualizarea, retragerea, jurnalul de operații, locurile de publicare, dry-run când
  agenția nu e activată.

## Ce propun să adăugăm (mic, doar unde chiar lipsește)

1. **Cerințe de publicare reale pentru Romimo.** Acum sunt declarate doar patru
   (tranzacție, preț, tip, locație), dar mapperul cere în plus titlu, descriere,
   suprafață utilă, an construcție, camere, iar pentru case suprafață construită/teren și
   încălzire. Fără ele, agentul află ce lipsește abia după apăsarea butonului. Le declar
   în lista de cerințe, ca avertismentul să apară înainte de trimitere.
2. **Validarea emailului contului Romimo.** Câmpul e marcat ca email în definiția
   portalului, dar formatul nu e verificat nici în formular, nici la salvare. Adaug
   verificarea în ambele locuri, cu mesaj în română.
3. **Activarea propriu-zisă** pentru agenția de test: salvare ApiKey + email, „Testează
   conexiunea”, apoi comutatorul de activare (care pornește și trimiterile reale).

Nimic altceva nu necesită modificări de interfață.

## Detalii tehnice

- `src/lib/portals/requirements.ts`: extind intrarea `romimo` cu regulile lipsă
  (reutilizând regulile existente; adaug doar ce nu există, fără reguli inventate).
- Validare email: în `PortalsCard` (înainte de `savePortalConnection`) și în
  `savePortalConnection`, pe baza câmpului `validate: "email"` deja declarat în registry,
  ca să rămână generic pentru orice portal viitor.
- Fără migrări, fără schimbări în adaptor, mapper sau client.
