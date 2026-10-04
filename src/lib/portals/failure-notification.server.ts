/** A stable id makes concurrent retries idempotent without changing the notification schema. */
async function notificationId(parts: string[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(parts));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = Array.from(hash.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type NotificationAdmin = {
  from: (table: string) => any;
};

/** Only a new failure call invokes this; historic error rows are never scanned. */
export async function notifyPortalFailure(
  admin: NotificationAdmin,
  input: { organizationId: string; propertyId: string; portalKey: string; portalName: string; error: string },
): Promise<void> {
  const { data: property } = await admin.from("properties")
    .select("title,assigned_to").eq("id", input.propertyId)
    .eq("organization_id", input.organizationId).maybeSingle();
  if (!property) return;
  const { data: admins } = await admin.from("user_roles")
    .select("user_id").eq("organization_id", input.organizationId).eq("role", "agency_admin");
  const recipients = new Set<string>((admins ?? []).map((row: { user_id: string }) => row.user_id));
  if (property.assigned_to) {
    const { data: agent } = await admin.from("profiles")
      .select("id").eq("id", property.assigned_to).eq("organization_id", input.organizationId).maybeSingle();
    if (agent) recipients.add(agent.id);
  }
  for (const userId of recipients) {
    const id = await notificationId(["habitoo-portal-failure", input.organizationId, input.propertyId, input.portalKey, input.error, userId]);
    const { error } = await admin.from("notifications").upsert({
      id,
      organization_id: input.organizationId,
      user_id: userId,
      type: "portal_failure",
      title: `Publicarea pe ${input.portalName} a eșuat pentru ${property.title}`,
      link: `/app/properties/${input.propertyId}?tab=publishing`,
    }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw error;
  }
}