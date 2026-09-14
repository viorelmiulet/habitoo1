/**
 * Punctul de intrare al interfeței în modulul de prospectare.
 * Reexportă doar server functions, ca UI-ul să nu importe niciodată module de
 * server (provideri, chei, runtime).
 */
export {
  listProspectingSources,
  listProspectingSearches,
  createProspectingSearch,
  listProspects,
  startProspecting,
  resumeProspecting,
  listProspectingRuns,
  importProspect,
  reviewProspect,
  type ProspectingSourceView,
  type ProspectingSearchView,
  type ProspectView,
  type ProspectingRun,
  type ProspectingRunResult,
  type ProspectImportOutcome,
} from "./prospecting.functions";
