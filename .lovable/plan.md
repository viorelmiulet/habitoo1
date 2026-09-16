# Reparare publicare Imobiliare.ro

## Obiectiv
Remedierea fluxului Imobiliare.ro de la validarea locală până la publicare, actualizare și retragere, fără a modifica integrările celorlalte portaluri.

## Implementare
1. **Telefon și WhatsApp coerente**
   - Centralizez alegerea și normalizarea numărului agent → agenție.
   - Folosesc exact aceeași regulă în verificarea pre-publicare, sincronizarea agentului și payload.
   - Blochez înainte de apel dacă numărul nu respectă formatul acceptat; `phones` și `whatsapp_number` vor fi mereu prezente și valide.

2. **Identitate stabilă și tranzacții multiple**
   - Serializez toate referințele externe Imobiliare.ro într-un singur câmp compatibil cu schema existentă.
   - Actualizarea, retragerea și ștergerea vor procesa toate referințele salvate.
   - Păstrez referința existentă când oferta trece între o singură tranzacție și vânzare + închiriere, evitând anunțuri abandonate.

3. **Catalog și diagnostic**
   - Publicarea va detecta catalogul de categorii lipsă/expirat și îl va actualiza controlat înainte de mapare.
   - Toate răspunsurile de eroare vor păstra statusul HTTP și corpul complet sanitizat în jurnal.
   - Rezultatele parțiale nu vor fi raportate ca succes global.

4. **Concurență sigură**
   - Înlocuiesc protecția exclusiv în memorie pentru operațiile pe anunț cu o blocare durabilă în baza de date, scoped pe agenție și referință.
   - Reîncercările nu vor crea duplicate și nu vor suprascrie operații concurente.

5. **Regresii și probă reală**
   - Adaug teste pentru telefon, payload complet, create → media → online, update cu referință existentă, două tranzacții, retragere, refresh catalog și jurnalizarea erorii.
   - Rulez verificarea de tipuri, toate testele și build-ul.
   - După publicarea versiunii, execut o singură publicare controlată pentru HB-1006 și verific jurnalul, identificatorii și sincronizarea agentului.

## Limită operațională
Proba reală pe Imobiliare.ro necesită ca versiunea reparată să fie publicată; până atunci validarea se poate încheia complet doar în preview și prin teste.
