# Curățare durabilă a șabloanelor generice

## Alegere
Folosesc varianta **(a)**: adaug o migrare compensatorie nouă. Migrarea `0023` este deja aplicată în mediul curent și nu trebuie rescrisă; o migrare nouă păstrează istoricul coerent pentru mediile existente și elimină aceleași rânduri la orice reconstrucție completă.

## Implementare
- Creez și aplic o migrare idempotentă care șterge exclusiv șabloanele platformei cu tipurile `sale_mandate`, `rent_mandate` și `viewing_report`.
- Verific jurnalul migrărilor și conținutul bazei după aplicare.
- Confirm că aplicația nu mai conține referințe active la tipurile eliminate.
- Rulez typecheck și toate testele automate.
