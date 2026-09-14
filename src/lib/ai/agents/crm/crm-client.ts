/**
 * Singurul import permis din interfață pentru CRM Agent: reexportă doar server
 * functions, ca UI-ul să nu atingă niciodată providerul sau cheile.
 */
export {
  askCrmAgent,
  decideCrmAction,
  listCrmAgentRuns,
  type CrmAgentTurn,
  type CrmAgentRun,
  type CrmAgentDecision,
} from "./crm.functions";

export { CRM_ACTION_LABELS, LEAD_STAGE_LABELS } from "./actions";
