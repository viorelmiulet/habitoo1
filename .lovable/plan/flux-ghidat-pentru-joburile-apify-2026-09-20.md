# Flux ghidat pentru joburile Apify

## Implementare
- Înlocuiesc editorul de surse cu un catalog de surse predefinite, menținut în cod și ascuns utilizatorului.
- Adaug dialogul „Job nou” cu sursă, tranzacție, tip de proprietate, localitate/zonă din nomenclator și limită de rezultate, plus estimarea costului.
- Păstrez o secțiune avansată, închisă implicit, exclusiv pentru superadmin, cu inputul și maparea JSON generate.
- Reorganizez ecranul în lista rulărilor în stânga și detaliile rulării selectate în dreapta, inclusiv progres, erori și primul rezultat brut.
- Salvez criteriile și inputul efectiv pe rulare pentru ca istoricul să rămână corect și reproductibil.

## Fără schimbări
- Nu modific normalizarea, deduplicarea, istoricul de preț, scrierea în bazin/prospecți, costul real sau regula de rulare manuală.
- Nu adaug programare, cron sau execuții automate.

## Verificare
- Testez construirea inputului pe sursă, ascunderea avansatului, estimarea costului și starea fără joburi.
- Rulez suita completă, verificarea tipurilor și build-ul automat.
