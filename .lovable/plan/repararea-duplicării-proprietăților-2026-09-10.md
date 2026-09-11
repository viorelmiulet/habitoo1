# Repararea duplicării proprietăților

## Ce voi schimba

- Mut duplicarea într-o funcție securizată pe server, care verifică utilizatorul și accesul la proprietatea sursă.
- Creez proprietatea nouă ca draft, cu toate câmpurile descriptive actuale, inclusiv detalii, utilități, finisaje, dotări, coordonate și colaborare.
- Copiez fizic fiecare fotografie în folderul noii proprietăți din stocare, apoi creez rândurile `property_images` cu ordinea, imaginea principală și flagurile originale.
- Copiez și documentele atașate fizic în folderul noii proprietăți, deoarece acestea sunt conținut propriu al fișei; ștergerea dintr-o copie nu va afecta cealaltă.
- Nu copiez publicări, identificatori externi, linkuri publice, lead-uri, activități, favorite, propuneri, mesaje sau istoric. Noua proprietate pornește draft și nepublicată.
- Păstrez auditul duplicării și actualizez butonul existent să folosească operația completă.

## Siguranță și consistență

- Dacă o copiere de fișier sau o inserare eșuează, curăț fișierele și înregistrările deja create pentru copia incompletă.
- Căile noi vor rămâne izolate pe structură `agenție/proprietate-nouă/...`; nu reutilizez fișierele sursă.
- Adaug teste pentru selecția câmpurilor copiate și excluderea explicită a stărilor de publicare.

## Verificare

- Rulez testele și verificarea TypeScript.
- Duplic efectiv o proprietate accesibilă cu fotografii și verific ordinea, imaginea principală, flagurile și absența oricărei publicări moștenite.
- Raportez comparativ ce se copia înainte și ce se copiază după remediere.
