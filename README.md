# Habitoo CRM

Construiește o platformă SaaS de tip CRM imobiliar modern, profesional și scalabil, destinată agențiilor imobiliare din România.

Platforma trebuie să aibă o interfață aerisită, elegantă, rapidă și foarte intuitivă, cu accent pe productivitatea agenților. Nu vreau o interfață încărcată sau învechită. Designul trebuie să inspire un produs SaaS premium, modern și profesional.

Inspiră arhitectura funcțională din:

ImmoFlux CRM

CRM REBS

RealManager

Nu copia designul acestor platforme și nu reproduce identic interfața lor. Preia doar conceptele funcționale bune și construiește o experiență modernă și coerentă.

SURSA FUNCȚIONALĂ:
ImmoFlux: proprietăți, contacte, cereri, lead-uri, activități, automatizări, contracte digitale, MLS, ACP, rapoarte, media, ansambluri, publicare programată, obiective și sincronizare cu portaluri.
CRM REBS: căutare globală rapidă, notificări, calendar, contacte, publicare pe portaluri, prezentări PDF, procesare imagini, hartă, ansambluri, matching, rapoarte, import/export, deduplicare, colaborare, contracte digitale, audit și permisiuni.
RealManager: dashboard, oferte, contacte, cereri, resurse, calendar, site agenție/agent, publicare portaluri, Google Calendar, MLS, rezervări, antecontracte, relații între entități, filtre și rapoarte.

==================================================

STRUCTURA PLATFORMEI
==================================================

Platforma trebuie să fie multi-tenant.

Nivelurile de acces:

SUPERADMIN

ADMIN AGENȚIE

AGENT

Fiecare agenție trebuie să fie izolată logic de celelalte agenții.

SUPERADMIN:

controlează întreaga platformă

vede toate agențiile

creează / editează / suspendă agenții

creează / editează / suspendă utilizatori

gestionează abonamentele

gestionează modulele disponibile

gestionează integrările globale

gestionează portalurile

vede statistici globale

vede logurile și auditul

poate accesa o agenție în mod support/impersonation controlat

poate configura limitele agenției

poate activa/dezactiva funcționalități

poate vedea starea sincronizărilor

poate gestiona API keys

poate gestiona setările platformei

ADMIN AGENȚIE:

vede toate datele agenției

gestionează agenții și utilizatorii agenției

poate adăuga/elimina agenți

atribuie proprietăți, lead-uri și cereri

vede rapoarte complete

configurează agenția

configurează publicarea pe portaluri

configurează site-ul agenției

configurează automatizările

gestionează documentele și șabloanele

gestionează sursele de lead-uri

poate vedea istoricul tuturor activităților

poate modifica permisiunile agenților

poate exporta datele agenției

AGENT:

vede doar datele permise de agenție

gestionează propriile proprietăți

gestionează clienții proprii

gestionează cererile proprii

gestionează lead-urile atribuite

gestionează activitățile proprii

poate crea și publica anunțuri conform permisiunilor

poate folosi matching

poate genera prezentări

poate încărca documente

poate utiliza calendarul

poate vedea dashboardul personal

Arhitectura de permisiuni trebuie să permită ulterior introducerea unor roluri custom.

================================================== 2. DASHBOARD

Creează dashboard diferit în funcție de rol.

SUPERADMIN DASHBOARD:

total agenții

agenții active

utilizatori activi

proprietăți totale

lead-uri totale

tranzacții

valoare tranzacționată

abonamente

venituri

sincronizări

erori de sistem

activitate recentă

grafic evoluție platformă

ADMIN AGENȚIE DASHBOARD:

proprietăți active

proprietăți noi

lead-uri noi

cereri active

vizionări programate

tranzacții

activitatea agenților

top agenți

proprietăți care necesită follow-up

lead-uri fără activitate

anunțuri publicate

performanța portalurilor

obiective lunare

notificări importante

AGENT DASHBOARD:

proprietățile mele

lead-urile mele

cererile mele

activitățile de azi

vizionări viitoare

follow-up-uri

clienți noi

matching-uri noi

proprietăți recomandate

obiectiv lunar

progres

notificări

Dashboard-ul trebuie să fie foarte vizual, cu carduri KPI, grafice și liste scurte.

================================================== 3. SIDEBAR PRINCIPAL

Structură recomandată:

Dashboard

PROPRIETĂȚI

Toate proprietățile

Proprietățile mele

Adaugă proprietate

Ansambluri

Harta proprietăților

CLIENȚI

Contacte

Proprietari

Cumpărători

Chiriași

Investitori

Parteneri

CERERI

Toate cererile

Cereri cumpărare

Cereri închiriere

Cereri investiție

LEAD-URI

Toate lead-urile

Lead-uri noi

Lead-uri în lucru

Lead-uri convertite

Lead-uri pierdute

ACTIVITĂȚI

Calendar

Apeluri

Întâlniri

Vizionări

Task-uri

Follow-up-uri

MATCHING

Potriviri proprietăți–clienți

Potriviri automate

Căutări salvate

PUBLICARE

Portaluri

Publicări

Publicare programată

Istoric publicări

Site agenție

Social media

MARKETING

Media Studio

Șabloane

Watermark

Prezentări PDF

DOCUMENTE

Contracte

Șabloane contracte

Documente clienți

Documente proprietăți

RAPOARTE

Activitate agenți

Portofoliu

Lead-uri

Conversii

Publicare

Tranzacții

Comisioane

Obiective

AUTOMATIZĂRI

Reguli

Workflow-uri

Grupuri de activități

Notificări automate

COLABORARE

Proprietăți colaborare

Agenții partenere

Solicitări colaborare

SETĂRI

Agenție

Utilizatori

Roluri și permisiuni

Integrări

Portaluri

API

Facturare

Audit

Pentru Superadmin trebuie să existe o zonă separată de administrare globală.

================================================== 4. PROPRIETĂȚI

Modul extrem de important.

Fiecare proprietate trebuie să conțină:

ID intern unic

ID extern

tip proprietate

categorie

subcategorie

vânzare / închiriere

status

titlu

descriere

preț

monedă

negociabil

suprafață

suprafață utilă

suprafață construită

teren

număr camere

dormitoare

băi

etaj

număr etaje clădire

an construcție

compartimentare

mobilier

utilități

încălzire

loc parcare

balcon / terasă

facilități

adresă

localitate

județ

sector

stradă

număr

coordonate GPS

pin hartă

poziționare exactă / aproximativă

proprietar

agent responsabil

agenție

sursă

data adăugării

ultima modificare

comision

TVA

informații interne

note private

Statusuri:

Draft

Activ

Rezervat

În negociere

Vândut

Închiriat

Expirat

Arhivat

Trebuie să permită duplicate check automat.

La adăugarea unei proprietăți, verifică automat existența unor proprietăți similare după:

telefon proprietar

adresă

coordonate

suprafață

preț

titlu

ID extern

Afișează avertisment înainte de creare dacă există o posibilă dublură.

================================================== 5. IMAGINI

Crearea unui Media Manager modern.

Funcții:

upload multiplu

drag & drop

reordonare

imagine principală

watermark automat

redimensionare

compresie

crop

rotire

editare

marcarea imaginilor confidențiale

ștergere

previzualizare

generare automată dimensiuni pentru diverse portaluri

Pregătește arhitectura pentru integrarea ulterioară a unui Media Studio mai avansat.

================================================== 6. CONTACTE / CRM

Contactele trebuie să fie centralizate.

Tipuri:

proprietar

cumpărător

chiriaș

investitor

agent

partener

dezvoltator

companie

Câmpuri:

nume

prenume

telefon

email

WhatsApp

companie

sursă

etichete

agent responsabil

observații

GDPR

status

data adăugării

Fiecare contact trebuie să aibă o pagină proprie cu:

date contact

proprietăți asociate

cereri

lead-uri

activități

întâlniri

vizionări

documente

email-uri

note

istoric

timeline complet

================================================== 7. CERERI

Cererea reprezintă nevoia clientului.

Exemplu:

Cumpărare apartament

buget minim/maxim

localități

zone

camere

suprafață

etaj

preferințe

facilități

termen

sursă

agent

prioritate

Închiriere:

buget

zonă

camere

mobilat

animale

termen

durată

Trebuie să existe matching automat între cereri și proprietăți.

================================================== 8. LEAD MANAGEMENT

Lead pipeline:

Nou
↓
Contactat
↓
Calificat
↓
Vizionare
↓
Ofertă
↓
Negociere
↓
Tranzacție
↓
Câștigat / Pierdut

Fiecare lead trebuie să aibă:

sursă

contact

proprietatea de interes

agent

status

scor

activități

ultima interacțiune

următorul follow-up

note

Lead-urile fără activitate de X zile trebuie marcate automat.

================================================== 9. ACTIVITĂȚI + CALENDAR

Activități:

apel

întâlnire

vizionare

task

email

follow-up

notă

Calendar:

zi

săptămână

lună

Fiecare activitate poate fi asociată cu:

contact

proprietate

lead

cerere

tranzacție

Remindere:

notificare în platformă

email

ulterior WhatsApp

Pregătește integrarea Google Calendar.

================================================== 10. CĂUTARE GLOBALĂ

Una dintre funcțiile cele mai importante.

Creează un search global în partea de sus.

Poate căuta instant:

proprietăți

contacte

telefoane

emailuri

ID-uri

adrese

cereri

lead-uri

agenți

Rezultatele să apară instant, fără reload.

Căutarea trebuie să accepte inclusiv ID-uri externe și numere de telefon.

================================================== 11. FILTRE ȘI CĂUTĂRI SALVATE

Toate listele importante trebuie să aibă:

filtre avansate

sortare

coloane configurabile

grupare

căutare

saved views

favorite

Utilizatorul trebuie să poată salva o combinație de filtre.

Exemplu:
"3 camere, Militari Residence, sub 120.000 EUR"

================================================== 12. PUBLICARE PORTALURI

Creează un modul centralizat de publicare.

O proprietate poate fi publicată pe mai multe portaluri.

Structura:

portal

status

data publicării

URL

ID extern

ultima sincronizare

erori

Pregătește integrarea pentru:

Imobiliare.ro

OLX

Storia

Publi24

HomeZZ

Romimo

Imopedia

Properstar

alte portaluri

IMPORTANT:
Arhitectura trebuie să folosească un sistem de conectori/adaptoare, astfel încât fiecare portal să poată fi integrat separat fără modificarea logicii principale.

Exemplu:
PortalAdapter

publish

update

unpublish

sync

getStatus

================================================== 13. PUBLICARE SOCIAL MEDIA

Pregătește integrare pentru:

Facebook

Instagram

alte canale ulterior

Creează un modul de generare postări din proprietate.

Template:

titlu

descriere

preț

caracteristici

CTA

imagini

Pregătește integrarea cu Facebook Graph API și cu o extensie Chrome pentru publicare în grupuri, care va fi conectată ulterior.

================================================== 14. SITE AGENȚIE

Pregătește posibilitatea ca fiecare agenție să aibă:

website propriu

subdomeniu

listă proprietăți

pagină proprietate

formular contact

formular cerere

branding propriu

Proprietățile publicate pe site trebuie să fie sincronizate cu CRM-ul.

================================================== 15. MATCHING

Sistem de matching inteligent.

Când apare o proprietate nouă:

verifică cererile compatibile

verifică clienții compatibili

calculează un scor

Când apare o cerere nouă:

verifică proprietățile compatibile

Scor exemplu:
95% = match excelent
80% = match bun
65% = match posibil

Factorii pot include:

preț

zonă

camere

suprafață

etaj

facilități

================================================== 16. RAPOARTE

Dashboard pentru management.

Rapoarte:

proprietăți active

proprietăți noi

proprietăți vândute

proprietăți închiriate

lead-uri

conversie lead → client

conversie client → tranzacție

activitatea agenților

apeluri

vizionări

follow-up-uri

timp mediu până la contact

publicări

performanța portalurilor

tranzacții

comisioane

obiective

Export:

CSV

XLSX

PDF

================================================== 17. OBIECTIVE

Adminul poate defini obiective:

Agent:

50 lead-uri/lună

20 vizionări

10 proprietăți noi

3 tranzacții

X lei comision

Dashboard cu progres în timp real.

================================================== 18. DOCUMENTE

Document manager.

Tipuri:

contract

rezervare

antecontract

proces verbal

fișier client

fișier proprietate

Șabloane dinamice cu variabile:

{{client.nume}}
{{client.telefon}}
{{proprietate.adresa}}
{{proprietate.pret}}
{{agent.nume}}

Pregătește arhitectura pentru semnătură electronică.

================================================== 19. AUTOMATIZĂRI

Creează un motor simplu de workflow.

Exemple:

WHEN:
Lead nou

THEN:

atribuie agent

creează task

trimite notificare

setează follow-up

Alt exemplu:

WHEN:
Proprietate nouă

THEN:

caută clienți potriviți

creează notificări

pregătește publicarea

Alt exemplu:

WHEN:
Lead fără activitate 3 zile

THEN:

notifică agentul

notifică managerul

================================================== 20. NOTIFICĂRI

Inbox central de notificări.

Tipuri:

lead nou

proprietate nouă

matching nou

vizionare

task

reminder

sincronizare eșuată

obiectiv

mesaj

================================================== 21. COLABORARE / MLS

Pregătește un modul de colaborare între agenții.

Datele confidențiale ale agenției nu trebuie expuse automat.

O proprietate poate fi:

privată

publică pentru colaborare

Pentru colaborare:

localitate

caracteristici

fotografii

preț

comision

date necesare colaborării

Telefonul proprietarului și datele interne trebuie să rămână ascunse.

================================================== 22. ANSAMBLURI IMOBILIARE

Creează modul:
Ansamblu → Clădiri → Unități

Exemplu:

Militari Residence
→ Bloc A
→ Apartament 101
→ Apartament 102

Fiecare unitate poate avea:

status

preț

suprafață

camere

etaj

disponibilitate

Permite clonarea rapidă a proprietăților.

================================================== 23. HARTĂ

Integrează hartă pentru proprietăți.

Funcții:

localizare automată adresă

pin manual

poziționare exactă / aproximativă

filtrare proprietăți pe hartă

================================================== 24. IMPORT / EXPORT

Import:

Excel

CSV

API

feed-uri externe

Pregătește importul din alte CRM-uri.

Include mapping de câmpuri:

Coloana externă → câmp CRM

Export:

proprietăți

contacte

cereri

lead-uri

activități

tranzacții

================================================== 25. INTEGRARE IMMOFLUX

Arhitectura trebuie pregătită pentru integrarea cu ImmoFlux.

Integrarea trebuie să suporte ulterior:

import proprietăți

sincronizare proprietăți

import contacte

actualizare status

feed-uri

API

sincronizare periodică

Nu hardcoda integrarea direct în modulele CRM. Creează un sistem de Integration Providers.

================================================== 26. API

Creează API pentru integrarea:

site

extensie Chrome

Facebook

portaluri

aplicații externe

Fiecare agenție poate avea propriul API key.

Superadmin poate:

genera

revoca

dezactiva

vedea ultima utilizare

Păstrează audit pentru fiecare request important.

================================================== 27. SECURITATE

Securitatea este critică.

Implementare:

multi-tenant isolation

Row Level Security

RBAC

audit logs

rate limiting

validare server-side

validare input

protecție XSS

protecție SQL injection

CSRF protection unde este relevant

session management

password policies

login history

soft delete

recovery

backup

activity logs

Un agent nu trebuie să poată șterge definitiv date critice.

Păstrează istoricul modificărilor.

Audit log:

cine

ce

când

IP

user agent

valoare veche

valoare nouă

================================================== 28. UX/UI

Design:

modern

premium

aerisit

minimalist

profesional

responsive

Desktop first, dar perfect utilizabil și pe tabletă / mobil.

Sidebar compact.

Header:

Global Search

Quick Add

Notifications

Help

Profile

Quick Add:

Proprietate

Contact

Lead

Cerere

Activitate

Tranzacție

Nu folosi tabele exagerat de aglomerate.

Folosește:

cards

tabs

drawers

modals

dropdowns

timeline

kanban

charts

Păstrează consistență vizuală în toate modulele.

================================================== 29. DATABASE

Construiește o schemă de database scalabilă.

Entități principale:

organizations
users
roles
permissions
properties
property_images
property_features
property_statuses
property_sources
property_portals
property_publications
contacts
contact_tags
leads
lead_sources
requests
activities
appointments
tasks
documents
document_templates
transactions
transaction_participants
developments
development_units
saved_searches
matches
notifications
automations
automation_runs
goals
goal_progress
integrations
integration_logs
api_keys
audit_logs
subscriptions
plans
billing
collaboration_listings

Fiecare entitate trebuie să aibă:

id

created_at

updated_at

created_by

updated_by

Entitățile tenant-specific trebuie să aibă organization_id.

================================================== 30. ARHITECTURA TEHNICĂ

Folosește:

React

TypeScript

modern component architecture

Supabase/Postgres

Supabase Auth

Row Level Security

storage pentru imagini/documente

Scrie cod modular.

Separă:

UI

business logic

API

integrations

database access

Nu pune toată logica într-un singur fișier.

Folosește reusable components.

================================================== 31. SUPERADMIN

Creează un panou separat:

/superadmin

Secțiuni:

Dashboard
Agencies
Users
Subscriptions
Plans
Modules
Integrations
Portal Connectors
API Keys
Audit
System Logs
System Settings

Agency detail:

date agenție

utilizatori

proprietăți

lead-uri

consum

activitate

integrații

abonament

Superadmin poate deschide o sesiune de support într-o agenție, dar toate aceste acțiuni trebuie auditate.

================================================== 32. ADMIN AGENȚIE

Ruta:

/app

Adminul vede toate modulele agenției.

Poate gestiona:

users

permissions

properties

leads

requests

contacts

activities

reports

integrations

billing

settings

================================================== 33. AGENT

Agentul trebuie să aibă o experiență simplificată.

Accentul pe:

proprietăți

clienți

lead-uri

cereri

calendar

matching

task-uri

Nu afișa opțiuni administrative.

================================================== 34. PAGINI PRINCIPALE

Construiește efectiv aceste pagini:

/login
/register
/forgot-password

/superadmin
/superadmin/agencies
/superadmin/users
/superadmin/subscriptions
/superadmin/integrations
/superadmin/audit

/app
/app/properties
/app/properties/new
/app/properties/:id
/app/contacts
/app/contacts/:id
/app/leads
/app/leads/:id
/app/requests
/app/requests/:id
/app/calendar
/app/activities
/app/matching
/app/publications
/app/portals
/app/media
/app/documents
/app/reports
/app/goals
/app/automations
/app/collaboration
/app/developments
/app/settings

================================================== 35. IMPORTANT – ORDINEA IMPLEMENTĂRII

Nu încerca să construiești tot CRM-ul într-un singur pas.

Construiește în faze.

FAZA 1:

autentificare

multi-tenant

Superadmin

Admin

Agent

RBAC

dashboard

database core

properties

contacts

requests

leads

activities

notifications

audit

FAZA 2:

calendar

matching

saved searches

map

media manager

documents

reports

goals

FAZA 3:

portal publishing

integrations

API

site agency

social media

ImmoFlux integration

FAZA 4:

automation engine

collaboration / MLS

digital contracts

advanced media studio

advanced analytics

billing SaaS

IMPORTANT:
După fiecare fază, codul trebuie să fie production-ready și să nu rupă funcționalitățile existente.

================================================== 36. PRINCIPIU ESENȚIAL

Vreau un CRM foarte rapid.

Nu vreau un sistem în care pentru orice acțiune utilizatorul trebuie să deschidă 3-4 ferestre.

Folosește:

inline editing

quick actions

keyboard shortcuts unde este relevant

global search

quick add

bulk actions

drag & drop

saved filters

contextual actions

Exemplu:
Din pagina unui contact trebuie să pot:

suna

trimite WhatsApp

crea activitate

vedea proprietățile potrivite

vedea cererea

programa vizionare
fără să pierd contextul.

================================================== 37. EXPERIENȚA FINALĂ

Produsul trebuie să transmită:

"Tot ce are nevoie o agenție imobiliară într-un singur loc."

Interfața trebuie să fie simplă pentru agent, dar extrem de puternică pentru manager.

Prioritizează:

viteză

claritate

productivitate

automatizare

securitate

scalabilitate

Nu construi un simplu CRUD de proprietăți.

Construiește o platformă CRM imobiliară SaaS completă, în care proprietățile, clienții, cererile, lead-urile, activitățile, publicarea, matching-ul, documentele, rapoartele și automatizările sunt conectate între ele.

Toate modulele trebuie să comunice între ele prin relații clare și să păstreze istoricul complet al activității.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://habitoo1.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0ed0592c-57ac-4230-b7c4-f4a2bb5746c5).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
