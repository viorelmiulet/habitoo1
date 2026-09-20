# Redesign navigare laterală

## Implementare
- Păstrez fundalul, sigla, poziția siglei, culorile și regulile actuale de vizibilitate.
- Refac antetul cu numele produsului și agenția, fără a muta controlul de restrângere.
- Uniformizez toate rândurile la minimum 44px, iconuri de 20px, etichete de 15px și stări active/inactive conform sistemului vizual.
- Transform grupurile existente cu mai multe destinații în grupuri expandabile; salvez starea pentru fiecare utilizator și deschid automat grupul rutei active.
- Mut meniul de cont existent în rândul utilizatorului din subsol și păstrez informația de plan deasupra lui.
- Păstrez sertarul mobil pe primitiva accesibilă existentă, cu fundal estompat, Escape, focus blocat și revenire la declanșator.

## Detalii tehnice
- Folosesc exclusiv tokenii din `src/styles.css`, componentele existente și navigarea TanStack.
- Adaug teste pentru `aria-current`, expandare/persistență, dimensiunea rândurilor și comportamentul sertarului.
- Verific suita completă, tipurile și build-ul automat al preview-ului.

## Fără schimbări
- Nu modific rute, permisiuni, denumiri de pagini, ordinea sau vizibilitatea elementelor.
