# Raport: căsuța de email Habitoo (doar constatare, nimic modificat)

Toate verificările au fost doar citiri. Nu am trimis emailuri și nu am schimbat nimic în Mailgun.

## 1. Configurarea
- Domeniu: `habitoo.ro`, regiunea **EU** (`api.eu.mailgun.net`), stare `active`, creat pe 11.09.2026.
- DNS: MX `mxa/mxb.eu.mailgun.org` valid, SPF, DKIM și tracking valide.
- Expeditor și singura adresă permisă la trimitere: `contact@habitoo.ro`.
- Ruta de primire: una singură, `catch_all()` → `forward("https://crm.habitoo.ro/api/public/mailgun/inbound")`, creată pe 11.09, activă. Toate adresele `@habitoo.ro` ajung la Habitoo.
- Webhook-uri de stare (livrat/eșuat): **niciunul configurat**. Din cauza asta, mesajele trimise rămân în Habitoo cu starea „accepted”, chiar dacă Mailgun le-a livrat.

## 2. Jurnalul Mailgun
Istoricul disponibil începe pe **24.09.2026 la 03:43 UTC** (aproximativ o zi, nu 96 de ore). O căutare pe 40 de zile întoarce același prim eveniment. În total sunt 8 evenimente, fără niciun eșec:

| Ora (UTC) | Direcție | De la → către | Subiect | Stare |
|---|---|---|---|---|
| 24.09 03:43 | trimis | contact@habitoo.ro → cristina.deres@russmedia.ro | Re: Documentatie integrare import… | accepted → delivered (250, server Outlook) |
| 24.09 12:39 | primit | olx-api-support@olx.com → contact@habitoo.ro | API-ul OLX - Modificări viitoare | delivered la Habitoo, **200 OK** |
| 24.09 19:09 | primit | contact@mvaimobiliare.ro → contact@habitoo.ro | test | delivered la Habitoo, **200 OK** |
| 24.09 19:10 | trimis | contact@habitoo.ro → contact@mvaimobiliare.ro | test | accepted → delivered (250) |

Nu apar evenimente `failed`, `rejected` sau `stored`.

## 3. Primirea în Habitoo
- Adresa de primire: `/api/public/mailgun/inbound`. Verifică semnătura Mailgun cu `MAILGUN_WEBHOOK_SIGNING_KEY`, apoi protecția la retrimitere, limita de trafic și salvarea.
- Cheia de semnare este setată. Singura verificare posibilă e practică: ambele primiri din jurnal au primit 200 și sunt salvate. Dacă cheia n-ar fi fost bună, răspunsul ar fi fost 401.
- În intervalul disponibil nu apar refuzuri 401, 5xx sau 503.

## 4. Baza de date
- Toate mesajele sunt într-o singură căsuță. Sunt 8 mesaje primite în total. **Ultimul primit cu succes a fost salvat pe 24.09 la 19:09:20 UTC** („test” de la mvaimobiliare.ro).
- Ultimele mesaje: primite pe 24.09 la 19:09 și la 12:39, pe 22.09 la 10:51 (properstar) și pe 21.09 la 06:46 (Cristina). Trimise pe 24.09 la 19:10 și la 03:43, pe 22.09 și pe 21.09.
- Toate mesajele trimise au starea „accepted”, niciunul „delivered”. Cauza e lipsa webhook-urilor de stare (punctul 1).

## 5. Ce s-a schimbat
Codul de email (primire, trimitere, Mailgun) nu s-a schimbat din 11.09.2026. Ruta Mailgun și domeniul sunt tot din 11.09. Nu există nicio modificare recentă.

## 6. Mesajele cu cristina.deres@russmedia.ro
| Data (UTC) | De la → către | Mailgun | În Habitoo |
|---|---|---|---|
| 21.09 06:46 | cristina → contact@habitoo.ro, „Documentatie integrare import - Publi24.ro și Romimo” | în afara istoricului Mailgun | **Da**, primit |
| 21.09 19:32 | contact@habitoo.ro → cristina, „Re: …” | în afara istoricului Mailgun | Da, trimis (accepted) |
| 24.09 03:43 | contact@habitoo.ro → cristina, „Re: …” | **delivered**, acceptat de serverul Outlook al russmedia (250 2.6.0) | Da, trimis (accepted) |

**De la Cristina, după 21.09:** nu există niciun mesaj, nici în Mailgun (de pe 24.09 03:43 încoace), nici în baza de date. Nu există niciun răspuns al ei la emailul de pe 24.09.

## Concluzie
- **Trimiterea funcționează.** Răspunsul pentru Cristina din 24.09 a fost livrat serverului ei de email. Dacă ea spune că nu l-a primit, emailul s-a oprit la ei: filtrul de spam sau carantina Outlook/Microsoft 365 de la russmedia.ro.
- **Primirea funcționează.** Mailgun trimite mesajele la Habitoo, Habitoo răspunde 200, le salvează și le afișează. Testul tău de la 19:09 și emailul OLX au ajuns.
- **Un eventual răspuns al Cristinei după 21.09 nu a ajuns deloc la Mailgun.** În intervalul disponibil nu există nimic de la ea. Pentru 21–24.09 jurnalul Mailgun nu mai are date, dar nici Habitoo nu a salvat nimic, deși primirea a funcționat tot timpul. Cel mai probabil, ea nu a răspuns sau răspunsul ei a fost blocat înainte să plece de la russmedia.
- Există și o problemă mică, separată: fără webhook-uri de stare, Habitoo nu arată niciodată „livrat” sau „eșuat” la mesajele trimise.
