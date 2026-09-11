# Link direct către aprobarea accesului

## Implementare
- Fac fila din Setări controlabilă prin parametrul `?tab=access`, păstrând fila Profil ca implicită.
- Actualizez notificările noi de acces să trimită la fila corectă și la cererea concretă.
- Actualizez linkul secundar din email către aceeași destinație precisă; butoanele fără autentificare rămân neschimbate.
- Evidențiez temporar cererea indicată și derulez automat la ea după încărcare.
- Aplic schimbarea în baza de date printr-o migrare nouă, fără rescrierea migrărilor deja aplicate.

## Verificare
- Rulez verificarea TypeScript și toate testele.
- Verific deschiderea directă a filei și destinația notificărilor.
- Raportez separat celelalte notificări care duc la pagini generale, fără să le modific.

## Detalii tehnice
- URL țintă: `/app/settings?tab=access&request=<id>`.
- Parametrii URL sunt validați de rută; fila rămâne sincronizată când utilizatorul schimbă tabul.
- Evidențierea folosește tokenii vizuali existenți și dispare automat.
