/** Assignment is a separate authorized operation; rejection never undoes ordinary edits. */
export async function savePropertyEdits(input: {
  saveDetails: () => Promise<void>;
  reassign: () => Promise<{ blocked: { message: string }[]; phoneWarning: string | null; syncWarning?: string | null }>;
  assignmentChanged: boolean;
}): Promise<string[]> {
  await input.saveDetails();
  if (!input.assignmentChanged) return [];
  try {
    const result = await input.reassign();
    return [...result.blocked.map(row => row.message), result.phoneWarning, result.syncWarning].filter((v): v is string => Boolean(v));
  } catch (error) {
    return [error instanceof Error ? error.message : "Agentul nu a putut fi schimbat."];
  }
}