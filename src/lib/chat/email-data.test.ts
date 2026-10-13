import { describe, expect, it } from "vitest";
import { additionalChatMessages, CHAT_EMAIL_IMAGE_TTL, chatConversationUrl, chatMessagePreview, requestedChatContact } from "./email-data";
import { chatEmailProps, chatEmailText, renderHabitooEmail } from "../email-templates/habitoo-email";

describe("chat email data rules", () => {
  it("private images are signed for seven days", () => {
    expect(CHAT_EMAIL_IMAGE_TTL).toBe(604800);
  });
  it("message preview is at most 200 Unicode characters", () => {
    expect(chatMessagePreview("Salut!")).toBe("Salut!");
    const preview = chatMessagePreview("🙂".repeat(250));
    expect(Array.from(preview)).toHaveLength(200);
    expect(preview.endsWith("…")).toBe(true);
  });
  it("counts only the messages besides the displayed one", () => {
    expect(additionalChatMessages(4)).toBe(3);
    expect(additionalChatMessages(1)).toBe(0);
    expect(additionalChatMessages(0)).toBe(0);
  });
  it("opens the identified conversation for agent and platform admin", () => {
    const convs = [{ conversation_id: "conv-a", other_user_id: "sender-a" }, { conversation_id: "conv-b", other_user_id: "sender-b" }];
    expect(chatConversationUrl("conv-b")).toBe("https://crm.habitoo.ro/app?conversation=conv-b");
    expect(chatConversationUrl("conv-b", true)).toBe("https://crm.habitoo.ro/superadmin?conversation=conv-b");
    expect(requestedChatContact(chatConversationUrl("conv-b"), convs)).toBe("sender-b");
    expect(requestedChatContact(chatConversationUrl("not-my-conversation"), convs)).toBeNull();
  });
  it("renders simulated sender content safely and retains a plain-text variant", async () => {
    const data = { senderName: "Agent test", agencyName: "Agenție test", message: '<img src=x onerror="alert(1)">', unreadCount: 1, conversationUrl: chatConversationUrl("conv-test") };
    const html = await renderHabitooEmail(chatEmailProps(data));
    expect(html).toContain("&lt;img");
    expect(html).not.toContain('<img src=x onerror="alert(1)">');
    const text = chatEmailText(data, "Subject unchanged");
    expect(text).toContain(data.message);
    expect(text).toContain(data.conversationUrl);
  });
});