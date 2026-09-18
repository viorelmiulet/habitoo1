/**
 * Lista unică de chei redactate recursiv în tracing și audit.
 *
 * Conține atât secretele tehnice (chei, tokenuri, parole), cât și câmpurile de
 * identitate citite din actul de identitate (CNP, serie, număr, data nașterii,
 * nume, adresă, MRZ, imaginea actului). Nici una dintre aceste valori nu are
 * voie să ajungă în `ai_trace_events`, `audit_logs` sau în vreun mesaj de
 * eroare.
 */
const SECRET_PART = "key|secret|token|password|apikey|authorization";

const IDENTITY_PART = [
  "cnp",
  "mrz",
  "serie",
  "series",
  "documentnumber",
  "document_number",
  "documentnr",
  "birthdate",
  "birth_date",
  "dateofbirth",
  "date_of_birth",
  "datanasterii",
  "data_nasterii",
  "surname",
  "givennames",
  "given_names",
  "fullname",
  "holdername",
  "nume",
  "prenume",
  "address",
  "adresa",
  "imagebase64",
  "image_base64",
  "imagedata",
  "image_data",
  "idimage",
  "documentimage",
].join("|");

/** Orice cheie care se potrivește este eliminată din detaliile trimise la audit/tracing. */
export const REDACTED_DETAIL_KEY = new RegExp(`(${SECRET_PART}|${IDENTITY_PART})`, "i");

/** Numele câmpurilor returnate de modulul de citire a actului, pentru verificări. */
export const ID_DOCUMENT_FIELD_NAMES = [
  "documentNumber",
  "nationality",
  "birthDate",
  "sex",
  "expiryDate",
  "surname",
  "givenNames",
  "cnp",
  "series",
  "address",
] as const;
