# Perioada de abonament: se salvează corect, dar selectorul afișează „Fără termen”

## Ce am verificat, chiar acum, în bază

1. **MG Imobiliare** are exact ce ai setat: perioadă gratuită de 14 zile, finalul pe
   **6 octombrie 2026**, marcaj de trial activ, actualizată azi la 19:38.
2. **Istoricul** agenției conține 3 intrări de abonament, cea mai recentă fiind
   „vechi: 30 de zile, expira 21 oct.” → „nou: trial 14 zile, expiră 6 oct.”. Deci
   salvarea a fost scrisă și jurnalizată corect.
3. Funcția din bază scrie toate câmpurile (termen, început, final, marcaj trial,
   reactivare din suspendare) într-o singură operație. **Nu există** niciun
   declanșator sau altă funcție care rescrie perioada după salvare: cele patru
   declanșatoare de pe agenții ating doar data ultimei modificări, limita de locuri,
   marcajul demo și sigla — niciunul nu atinge perioada.
4. În pagina „Stare agenții”, după salvare se face o singură reîmprospătare a
   listei; în „Agenții”, butonul de perioadă trimite exclusiv agenția și termenul
   alese — nicio altă valoare veche nu e retrimisă.

## Concluzia

Valoarea **nu se pierde nici la scriere, nici la suprascriere, nici din cache**.
Problema e strict de afișare, într-un singur loc: selectorul de perioadă recunoaște
doar „30 de zile” și „12 luni”. Orice altă valoare — inclusiv cele două perioade
gratuite (14 și 30 de zile) — cade pe opțiunea implicită „Fără termen (nelimitat)”.
Deci după salvare vezi confirmarea corectă, dar caseta revine vizual la „Fără
termen”, chiar dacă în bază agenția este pe trial de 14 zile.

Efect secundar al aceleiași cauze: cu perioada gratuită selectată, butonul
„Salvează” pare activ fără să fi schimbat nimic, iar butonul „Reînnoiește” nu apare.

Textul din dreptul agenției („Trial până la 6 oct. 2026”) folosește alt calcul și
afișează deja starea reală — de aici nepotrivirea dintre badge și casetă.

## Ce propun să corectez

Un singur fișier, `src/components/superadmin/SubscriptionPicker.tsx`: caseta să
recunoască toate cele patru perioade valide (trial 14 zile, trial 30 zile, 30 de
zile, 12 luni) și să cadă pe „Fără termen” doar când agenția chiar nu are termen.
Așa, după salvare, caseta arată perioada setată, „Salvează” rămâne inactiv până
schimbi ceva, iar „Reînnoiește” apare corect.

## Detalii tehnice

- `SubscriptionPicker`: `const current = term === "30d" || term === "12m" ? term : "none"`
  devine o verificare pe lista existentă `SUBSCRIPTION_TERMS` din `src/lib/subscription.ts`
  (deja include `trial_14d` și `trial_30d`).
- Fără migrări, fără schimbări în funcția din bază, în paginile „Agenții” /
  „Stare agenții” sau în restul componentelor.
- Adaug un test scurt care verifică faptul că o agenție cu `trial_14d` preselectează
  perioada gratuită de 14 zile, nu „Fără termen”.
