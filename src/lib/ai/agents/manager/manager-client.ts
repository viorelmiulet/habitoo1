/**
 * Singurul import permis din interfață pentru Habitoo Manager Agent: reexportă
 * server functions și modulele pure de etichete, ca UI-ul să nu atingă
 * providerul, cheile sau prompturile.
 */
export {
  runManagerPlan,
  decideManagerPlan,
  listManagerPlans,
  getManagerPlan,
  type ManagerTurn,
  type ManagerRun,
  type ManagerDecisionResult,
} from "./manager.functions";

export {
  MANAGER_AGENT_LABELS,
  MANAGER_INTENT_LABELS,
  type ManagerAgent,
  type ManagerIntent,
} from "./intent";

export type { ManagerStep, ManagerStepStatus } from "./plan";
