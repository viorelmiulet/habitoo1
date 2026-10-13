/** Conexiune pregătită: status connected/ready; ClickImob e gata imediat ce e activat. */
export function portalConnectionReady(
  portalId: string,
  connection: { status?: string | null; activated?: boolean | null } | null | undefined,
): boolean {
  if (connection?.status === "connected" || connection?.status === "ready") return true;
  return portalId === "clickimob" && connection?.activated === true;
}
