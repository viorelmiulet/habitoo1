export const CHAT_EMAIL_IMAGE_TTL = 7 * 24 * 60 * 60;

export function chatMessagePreview(body: string) {
  const chars = Array.from(body);
  return chars.length > 200 ? `${chars.slice(0, 199).join("")}…` : body;
}

export function chatConversationUrl(conversationId: string, platformAdmin = false) {
  const url = new URL(platformAdmin ? "/superadmin" : "/app", "https://crm.habitoo.ro");
  url.searchParams.set("conversation", conversationId);
  return url.toString();
}

export function requestedChatContact(
  href: string,
  conversations: readonly { conversation_id: string; other_user_id: string }[],
) {
  const id = new URL(href, "https://crm.habitoo.ro").searchParams.get("conversation");
  return conversations.find((c) => c.conversation_id === id)?.other_user_id ?? null;
}

export function additionalChatMessages(count: number) {
  return Math.max(0, count - 1);
}