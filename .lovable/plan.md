# Redesign fila „Publicare”

## Ce schimb
- Refac antetul paginii proprietății pentru fila Publicare: întoarcere, titlu, contextul disponibil și acțiunile „Editează” / „Publică pe portaluri”, cu un singur buton principal.
- Restrâng navigarea vizibilă în această experiență la Detalii, Fotografii, Publicare, Activitate și Contracte, păstrând ecranele și acțiunile existente accesibile fără a schimba logica lor.
- Refac lista într-un card uniform pentru fiecare portal, cu logo, stare semantică, mesaj real, link și acțiunile deja permise.
- Mut promovările într-un bloc separat, păstrând exact funcțiile, alocările și regulile existente.
- Adaug în coloana din dreapta pregătirea pentru publicare și jurnalul existent al operațiilor pentru proprietatea curentă.
- Adaptez așezarea pentru ecrane sub 1100px și telefoane, folosind exclusiv componentele și tokenii sistemului vizual.

## Date și limite
- Nu inventez statistici, agent, identificator de cerere sau date pe care răspunsurile actuale nu le oferă; elementele indisponibile vor fi omise și raportate la final.
- Mesajul portalului are prioritate față de orice mesaj generic.
- Nu schimb funcțiile server, permisiunile, selectarea, publicarea, retragerea, promovările sau alocările.

## Verificare
- Adaug teste pentru portal publicat, refuzat, feed-only și inactiv, inclusiv mesajul real de eroare și ascunderea serviciilor dezactivate.
- Rulez testele relevante și suita completă, verificarea tipurilor și confirm build-ul preview-ului.
- Verific vizual desktop și telefon, inclusiv ordinea coloanelor și înălțimea butoanelor.

## Detalii tehnice
- Refolosesc `Button`, `Input`, `StatusPill`, `Card`, `Panel`, `Tabs` și controalele existente.
- Extind numai datele de citire deja existente dacă jurnalul proprietății poate fi expus prin aceeași zonă de portaluri, fără schimbări de schemă sau flux operațional.
