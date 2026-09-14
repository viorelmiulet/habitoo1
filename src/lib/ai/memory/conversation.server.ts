/**
 * Memoria de conversație — separată explicit de starea workflow-urilor.
 *
 * Stage 11 folosește DOAR memorie de conversație pe termen scurt: ultimele
 * `AI_HISTORY_MESSAGES` mesaje ale conversației curente. Nu există memorie
 * permanentă și nicio conversație nu devine automat cunoștință de lungă durată.
 */
import { AI_HISTORY_MESSAGES } from "../usage/limits";
import type { AiActor } from "../gateway/types";

export const AI_MEMORY_MODE = "short_term_conversation" as const;

export type AiMemoryMessage = { role: string; content: string; createdAt: string };

type MemoryClient = {
  from: (table: "ai_messages") => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        eq: (
          column: string,
          value: string,
        ) => {
          order: (
            column: string,
            options: { ascending: boolean },
          ) => {
            limit: (
              count: number,
            ) => Promise<{ data: { role: string; content: string; created_at: string }[] | null }>;
          };
        };
      };
    };
  };
};

/** Ultimele mesaje ale conversației, în ordine cronologică. */
export async function loadConversationMemory(
  client: MemoryClient,
  actor: AiActor,
  conversationId: string,
  limit: number = AI_HISTORY_MESSAGES,
): Promise<AiMemoryMessage[]> {
  const { data } = await client
    .from("ai_messages")
    .select("role,content,created_at")
    .eq("conversation_id", conversationId)
    .eq("organization_id", actor.organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? [])
    .reverse()
    .map((row) => ({ role: row.role, content: row.content, createdAt: row.created_at }));
}

/** Starea memoriei, expusă în setări. Nicio memorie permanentă în Stage 11. */
export function aiMemoryStatus(): {
  mode: typeof AI_MEMORY_MODE;
  messages: number;
  persistent: false;
} {
  return { mode: AI_MEMORY_MODE, messages: AI_HISTORY_MESSAGES, persistent: false };
}
