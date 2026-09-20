# Fundația sistemului vizual

## Raport înainte de modificări

### Unde trăiesc valorile astăzi
- Proiectul folosește Tailwind CSS v4 (`package.json:53,78`), fără `tailwind.config.*`. Intrarea și sursele sunt în `src/styles.css:1-3`.
- Maparea tokenilor Tailwind este în `src/styles.css:13-80`; culorile temei deschise sunt variabile CSS în `src/styles.css:82-132`, iar tema întunecată le suprascrie în `src/styles.css:134-176`.
- Raza pornește dintr-o singură valoare `--radius: 1rem` (`src/styles.css:83`) și este derivată pentru `sm`–`3xl` (`src/styles.css:24-29`).
- Spațierea nu are tokeni proprii; folosește scala implicită Tailwind direct în clasele componentelor și ecranelor.
- Fonturile sunt declarate ca Plus Jakarta Sans și Sora în `src/styles.css:14-15`, aplicate în `src/styles.css:183-195`, și încărcate separat din Google Fonts pentru CRM în `src/components/app/app-head.ts:3-15` și pentru site în `src/components/marketing/public-head.ts:7-8,55-57`.
- Umbrele sunt definite separat în `src/styles.css:76-79`, iar utilitarele `panel` și `mk-frame` le aplică în `src/styles.css:198-203,244-250`.

### Componente comune existente
- Butoane: `src/components/ui/button.tsx:7-49`, cu 6 variante și 4 mărimi; valorile actuale sunt 32–40px, rază `rounded-md`, greutate 500 și umbre (`:8-25`).
- Input: `src/components/ui/input.tsx:5-22`; Label: `src/components/ui/label.tsx:9-21`. Mesajul de eroare și hint-ul nu fac parte încă dintr-o singură implementare.
- Badge generic: `src/components/ui/badge.tsx:6-32`; badge semantic separat: `src/components/app/StatusBadge.tsx:3-48`.
- Card generic: `src/components/ui/card.tsx:5-55`; panou/secțiune separat: `src/components/app/SectionCard.tsx:9-52`; utilitarul CSS `panel`: `src/styles.css:198-203`.
- Formulare de proprietăți mai au wrapper-ul `FormSection` în `src/components/app/FormSection.tsx:8-30`.

### Stiluri locale în locul componentelor comune
Scanarea tuturor fișierelor `src/**/*.ts(x)`, excluzând implementarea comună a categoriei, găsește:
- 33 fișiere cu `<button>` propriu; exemple: `src/routes/__root.tsx:58-64`, `src/routes/preturi.tsx:141`, `src/components/app/AppSidebar.tsx`.
- 7 fișiere cu `<input>` propriu; exemple: `src/routes/_authenticated/app.acp.date-piata.index.tsx:373`, `src/components/app/AgencyBrandingCard.tsx:273`, `src/components/app/PropertyMediaManager.tsx:281`.
- 27 fișiere cu pill/badge construit local (`rounded-full` + stil de text/padding); exemple: `src/routes/functionalitati.tsx:263`, `src/routes/_authenticated/app.acp.new.tsx:233`, `src/routes/_authenticated/app.leads.tsx:654`.
- 75 fișiere cu suprafețe tip card construite local (rază mare + border/background/shadow); exemple: `src/routes/contact.tsx:168`, `src/routes/oferta.$id.tsx:120`, `src/routes/_authenticated/app.acp.$id.tsx:72`.
- Uniunea este de **95 de fișiere** cu cel puțin una dintre aceste abateri. Aceasta este o numărătoare structurală, nu o afirmație că toate sunt greșite: include controale specializate, upload-uri și containere care pot rămâne intenționat locale. În acest pas nu le migrez.

## Implementare

### O singură sursă de adevăr
- Înlocuiesc valorile vizuale globale în `src/styles.css` cu paleta exactă cerută: ground, surface, subtle surface, border, cele trei niveluri de text, gold/gold-dark/gold-tint, stările success/danger/neutral și sidebar.
- Definesc explicit razele `control` 10px, `card` 14px, `panel` 16px și `pill` 999px și le expun ca utilitare Tailwind semantice.
- Schimb fonturile globale la Fraunces 600 pentru titluri și Manrope 400/600/700 pentru restul, cu fallback real; actualizez ambele head helpers la aceleași familii Google Fonts.
- Elimin efectul vechilor valori întunecate asupra tokenilor; tema întunecată nu este reproiectată în acest pas.
- Elimin umbrele din implementările de bază Card/Panel, fără a restiliza ecrane individuale.

### Componente de bază
- Actualizez `Button` la 44px implicit / 38px compact, rază 10px, greutate 700 și variantele primary, secondary, soft, danger, plus starea disabled exactă. Păstrez aliasuri compatibile pentru numele folosite deja, ca să nu rup ecranele existente. Documentez lângă componentă regula „maximum un buton primary per ecran”.
- Extind implementarea comună Input cu Label, hint și error, păstrând compatibilitatea cu folosirea actuală a `<Input />`; focus și eroare folosesc tokenii ceruți.
- Introduc `StatusPill` cu stările numite `published`, `pending`, `error`, `inactive`; `StatusBadge` va delega la aceeași implementare, nu va crea un al doilea sistem.
- Actualizez `Card` și introduc `Panel`, cu razele 14px / 16px, border de 1px și fără umbre. `SectionCard` va folosi baza Panel fără a schimba structura ecranelor.

### Protecții și teste
- Adaug teste de randare pentru toate variantele Button, stările Input, cele patru StatusPill și Card/Panel.
- Adaug o regulă ESLint locală care respinge în fișierele componentelor orice hex din paleta rolurilor; `src/styles.css` rămâne singurul loc permis pentru acele valori.
- Rulez suita completă, verificarea tipurilor, lint și confirm build-ul generat de preview.

## Ecrane care se schimbă vizibil doar prin schimbarea tokenilor
- Publice și acces: Acasă, Despre, Funcționalități, Prețuri, Contact, Termeni, Confidențialitate, Login, Înregistrare, Recuperare/Resetare parolă, Acces cont, Oferta publică, Semnare și callback autentificare.
- CRM: Dashboard, Activități, Obiective, Notificări, Contacte, Lead-uri, Proprietăți, Cereri, Contracte, Calendar, Colaborare, ACP și Date piață, AI, Matching, Prospectare, Rapoarte, Setări, Suport, Echipă și Onboarding.
- Superadmin: Dashboard, Agenții, Utilizatori, Audit, Mail, Nomenclator, Portaluri, QA, Stare agenții și Suport.

Nu mut stilurile locale și nu redesenez niciun ecran în această etapă; schimbările vizibile provin doar din tokenii globali și componentele de bază deja consumate.
