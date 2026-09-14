/**
 * Punctul de intrare al interfeței în AI Gateway.
 * Reexportă doar server functions, ca UI-ul să nu importe niciodată module
 * de server (provider, chei, gateway).
 */
export {
  getAiStatus,
  sendAiMessage,
  listAiConversations,
  getAiConversation,
  startAiWorkflow,
  resumeAiWorkflow,
  listAiWorkflows,
  type AiStatus,
  type AiConversationSummary,
  type AiConversationMessage,
  type AiWorkflowRun,
  type AiWorkflowResult,
} from "./ai.functions";

export type AIResponseLike = {
  status: "ok" | "not_configured" | "rate_limited" | "failed";
  answer: string;
  warnings: string[];
  conversationId: string | null;
  message?: string;
};
