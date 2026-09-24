# Raport: retrimiterea LaCheie `ad9f95e6…` (doar investigație, nimic modificat)

## Starea actuală (verificată acum)
Jobul nu mai este `queued`. A pornit azi la 03:58:01 UTC, după pornirea manuală aprobată, și s-a încheiat la 03:58:09: `status=done`, 5 oferte, 0 trimise, 5 eșuate. Nu mai există niciun job activ pentru agenția de test, deci nu este nimic de anulat.

## 1. Fluxul complet
```text
Buton în interfață -> lacheie.functions.ts (server, ~l.964)
  -> startLaCheieResendJob (resend.server.ts l.139)
     1. refuză dacă agenția are deja un job activ
     2. alege ofertele, inserează jobul `queued` + elementele
     3. apelează imediat lacheie_resend_arm()
        - dacă apelul dă eroare: jobul devine `failed` cu mesaj clar și eroarea ajunge în interfață
lacheie_resend_arm() -> programează `lacheie-resend-worker` la fiecare minut, dacă nu există deja
lacheie_resend_tick() -> apelează /api/public/cron/lacheie-resend cu un nonce;
                         când coada e goală, își anulează singur programarea
```

## 2. De ce jobul din 18.09 nu a pornit singur
- Armarea exista deja în cod: a fost adăugată pe 17.09 la 15:01, deci înainte de crearea jobului (18.09, 04:45).
- Eroarea nu a fost ignorată în tăcere: în cod, o eroare la armare marchează jobul `failed`. Jobul a rămas însă `queued`.
- Definiția actuală a funcției `lacheie_resend_arm()` este corectă.
- Concluzie probabilă: jobul a fost creat dintr-o versiune mai veche a aplicației, fără pasul de armare (de exemplu site-ul publicat înainte de republicare), sau funcția din baza de date a apărut după 18.09. Nu pot confirma exact: istoricul migrărilor și al programărilor nu îmi este accesibil. Ambele variante privesc doar trecutul.

## 3. O retrimitere nouă ar porni corect?
Da, după cod și definiția funcției: armarea are loc imediat după inserare, verifică eroarea și nu dublează programarea. Workerul își anulează singur programarea, apoi reverifică și se rearmează dacă între timp a apărut un job nou. Singura dependență, `cron_nonce_issue`, a fost reparată pe 23.09, iar rularea de azi a confirmat tot lanțul: armare, worker, apel către rută și încheiere.
Condiție: aplicația publicată trebuie să ruleze versiunea curentă a codului.

## 4. Comparație cu coada de poze de la import
- Tipar identic în baza de date: aceeași verificare „dacă nu există” urmată de programare, aceeași auto-dezarmare.
- Diferență în aplicație: importul doar notează eroarea de armare în jurnal și continuă, așa că jobul poate rămâne blocat fără semnal. Retrimiterea LaCheie este mai strictă: marchează jobul `failed` și afișează eroarea. Varianta LaCheie este mai sigură.

## Concluzie
Problema a ținut doar de acest job vechi. Mecanismul de pornire funcționează pentru retrimiterile noi. Nu este nevoie de nicio reparație la armare și nici de anulare: jobul este deja închis.

## Pași propuși (doar dacă îi aprobi)
1. Investigarea celor 5 eșecuri „The portal returned an error” fără cod HTTP, doar prin citire.
2. Opțional: la importul de poze, eroarea de armare să marcheze jobul, la fel ca la LaCheie.
3. Pentru joburi de test blocate pe viitor: butonul existent de anulare (`requestLaCheieResendCancel`). Nu se șterge nimic din tabele.
