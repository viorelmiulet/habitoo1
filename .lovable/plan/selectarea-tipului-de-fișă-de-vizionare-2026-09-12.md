# Selectarea tipului de fișă de vizionare

## Ce voi schimba

- La apăsarea acțiunii de generare, deschid un dialog cu două opțiuni clare: „Pentru client” și „Pentru alt agent”.
- Pentru client, fișa va afișa logo-ul agenției, telefonul agenției și numele plus telefonul agentului care o generează.
- Pentru alt agent, fișa va păstra identificarea agenției, dar va ascunde toate numerele de telefon.
- În ambele variante, subsolul va afișa logo-ul Habitoo și textul „Generat cu Habitoo CRM”, indiferent de preferința existentă pentru alte materiale.

## Detalii tehnice

- Extind modelul fișei cu destinația și datele agentului, fără modificări în baza de date sau în regulile de acces.
- Folosesc datele existente din profilul utilizatorului și din setările agenției; valorile lipsă nu vor produce etichete goale.
- Folosesc logo-ul Habitoo local existent, astfel încât să apară și la tipărire.

## Verificare

- Verific ambele variante, inclusiv absența completă a numerelor în fișa pentru alt agent.
- Verific încărcarea fotografiilor, a logo-ului agenției și a logo-ului Habitoo înaintea dialogului de tipărire.
- Verific afișarea pe ecran mic și lipsa erorilor de compilare.
