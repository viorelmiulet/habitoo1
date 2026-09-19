# Contracte — citirea actului, etapa 2: poză și extragere vizuală

Poza actului nu este salvată nicăieri: nici în bucket, nici în tabel, nici în fișier temporar, nici în loguri sau mesaje de eroare. Există doar în memorie, pe durata cererii.

## Ce va putea face utilizatorul

- Trimite spatele actului (zona citibilă automat) și, opțional, fața — fie ca fișier, fie ca fotografie făcută pe loc.
- Formate acceptate: JPG, PNG, WEBP, HEIC și PDF (din PDF se citește doar prima pagină).
- Dacă poza nu e bună, primește un motiv concret („imaginea este prea neclară", „zona citibilă automat nu a fost găsită", „documentul pare tăiat"), nu o eroare generică.
- Datele citite din zona automată sunt verificate matematic; cele citite de pe fața actului (domiciliu, autoritate emitentă, valabilitate, serie) rămân marcate „de confirmat" și trebuie confirmate manual înainte de generarea unui contract.
- Când fața și zona automată spun altceva la același câmp (nume, număr document), se raportează conflictul; nu se alege în silence o variantă.

## Implementare

### 1. Pregătirea imaginii pe server (`src/lib/contracts/id/prepare.server.ts`)
Tot în memorie, fără scriere pe disc, cu pachetele deja instalate (`jpeg-js`, `fast-png`, `pdf-lib`):
- verificare semnătură de fișier vs. tipul declarat, plafon de octeți la intrare și după reducere;
- JPEG: citirea orientării din EXIF, rotire/oglindire, reducere la latura maximă 1600 px, recodare JPEG;
- PNG: decodare, reducere, recodare JPEG;
- PDF: extragerea primei pagini într-un PDF nou de o pagină, trimis ca atare;
- WEBP/HEIC: nu există decodor pur-JS compatibil cu mediul de rulare al serverului (fără biblioteci native). Acestea sunt trimise așa cum sunt (modelul le acceptă), cu plafon de mărime; pentru ele reîncercarea cu decupaj nu este posibilă și se cere o poză JPG. Aceasta este singura limitare față de cerință și o marchez explicit.
- decupajul treimii inferioare (pentru reîncercare) se face pe pixelii deja decodați, doar pentru JPEG/PNG.

### 2. Citirea zonei automate (`src/lib/contracts/id/vision.server.ts`)
- prompt strict: modelul întoarce exclusiv cele trei linii brute, fără interpretare, fără JSON;
- liniile intră în parserul determinist din etapa 1 — modelul nu decide niciodată dacă un câmp e valid, cifrele de control decid;
- dacă cifrele de control cad: o singură reîncercare cu decupaj mărit al treimii inferioare; apoi mesaj clar de recapturare;
- calitate: motive concrete derivate din ce lipsește (lipsă linii, linii scurte/tăiate, text nelizibil).

### 3. Fața actului (`vision.server.ts`)
- prompt separat cu schemă strictă pentru domiciliu, autoritate emitentă, date de valabilitate, serie;
- fiecare câmp întors cu `source: "vision"` și `status: "unverified"`;
- conflictele pe câmpurile comune (nume, număr document) se întorc într-o listă `conflicts`, fără fuziune.

### 4. Provider vizual (`src/lib/ai/providers/`)
- extindere minimă: mesajul de utilizator poate purta atașamente `{ mimeType, base64 }`, trimise ca `inlineData` către Gemini;
- tokenii reali raportați de provider sunt păstrați ca până acum (necunoscut rămâne necunoscut).

### 5. Cost și abuz (`src/lib/contracts/id-document.functions.ts`)
- poarta existentă `checkAiQuota` (limite per utilizator și plafon per agenție) înainte de orice apel;
- limită separată de încercări pe utilizator pe oră pentru citirea actului;
- fiecare apel vizual scris în `ai_usage_events` cu `capability: "id_document_vision"`.

### 6. Forma rezultatului
Neschimbată față de etapa 1: `value`, `source` („mrz" | „vision"), `status`, `reason`. Se adaugă `confidence` per câmp doar dacă providerul întoarce una reală — altfel rămâne absentă.

### 7. Teste
Pregătire (rotire EXIF, reducere, prima pagină din PDF), calea zonei automate care alimentează parserul determinist, reîncercarea la cifre de control greșite, conflict față/zonă raportat și nefuzionat, câmpurile vizuale mereu „de confirmat", consumul numărat, plus o verificare automată care cade dacă vreun modul din această cale apelează stocare, scriere pe disc sau pune octeți de imagine în loguri/audit.

Rulez apoi suita completă, verificarea de tipuri și build-ul.
