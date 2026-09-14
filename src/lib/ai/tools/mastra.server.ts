/**
 * Integrarea Mastra ca runtime de tool-uri/agent.
 *
 * Tool-urile Habitoo sunt înregistrate ca tool-uri Mastra (`createTool`), cu
 * schema Zod din registry și execuție prin `executeAiTool`, deci autorizarea și
 * filtrarea pe agenție rămân în Habitoo, nu în runtime. Nu folosim nicio
 * funcționalitate Mastra care ar cere un serviciu cloud plătit: totul rulează
 * server-side, în procesul aplicației.
 */
import { createTool } from "@mastra/core/tools";
import { AI_TOOLS } from "./registry";
import { executeAiTool, type AiToolExecution } from "./executors.server";
import type { AiActor } from "../gateway/types";

export const MASTRA_RUNTIME = "mastra" as const;

export type HabitooMastraTool = {
  id: string;
  execute: (args: unknown) => Promise<AiToolExecution>;
};

/**
 * Construiește setul de tool-uri Mastra legat de un actor verificat.
 * Actorul este capturat în closure: modelul nu îl poate schimba prin argumente.
 */
export function buildMastraTools(actor: AiActor): Record<string, HabitooMastraTool> {
  const tools: Record<string, HabitooMastraTool> = {};
  for (const definition of AI_TOOLS) {
    const tool = createTool({
      id: definition.name,
      description: definition.description,
      inputSchema: definition.schema as never,
      execute: async ({ context }: { context: unknown }) =>
        executeAiTool(actor, definition.name, context),
    });
    tools[definition.name] = {
      id: definition.name,
      execute: async (args: unknown) => {
        const runner = tool.execute as unknown as (input: {
          context: unknown;
        }) => Promise<AiToolExecution>;
        return runner({ context: args });
      },
    };
  }
  return tools;
}
