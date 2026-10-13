import * as React from "react";
import { Body, Head, Html, Preview } from "@react-email/components";
import { render } from "@react-email/render";
import { initials } from "../format";
import { additionalChatMessages, chatMessagePreview } from "../chat/email-data";
import { brand } from "./layout";

export interface HabitooEmailProps {
  preview: string;
  heading: string;
  actionLabel: string;
  actionUrl: string;
  footer: string;
  children: React.ReactNode;
}

const palette = { ...brand, paper: "#ffffff", bubble: "#F1F3F5", avatar: "#25766F" };
const copy: React.CSSProperties = { fontFamily: "Helvetica, Arial, sans-serif", color: palette.ink, lineHeight: "1.6", overflowWrap: "anywhere", wordBreak: "break-word" };
const table: React.CSSProperties = { borderCollapse: "collapse", width: "100%" };
export const CHAT_EMAIL_LOGO_URL = "https://crm.habitoo.ro/assets/habitoo-email-logo.png";

export function HabitooEmail({ preview, heading, actionLabel, actionUrl, footer, children }: HabitooEmailProps) {
  return (
    <Html lang="ro" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ ...copy, margin: 0, backgroundColor: palette.paper }}>
        <table role="presentation" cellPadding="0" cellSpacing="0" style={table}>
          <tbody><tr><td align="center" style={{ padding: "24px 12px" }}>
            <table role="presentation" width="600" cellPadding="0" cellSpacing="0" style={{ ...table, maxWidth: 600, tableLayout: "fixed" }}>
              <tbody>
                <tr><td style={{ backgroundColor: palette.navy, padding: "24px 28px", borderBottom: `4px solid ${palette.gold}` }}>
                  <a href="https://crm.habitoo.ro"><img src={CHAT_EMAIL_LOGO_URL} alt="Habitoo CRM" width="168" height="80" style={{ display: "block", border: 0 }} /></a>
                </td></tr>
                <tr><td style={{ padding: "32px 24px 28px", backgroundColor: palette.paper, border: `1px solid ${palette.line}` }}>
                  <p style={{ margin: "0 0 8px", color: palette.muted, fontSize: 12 }}>MESAJE · HABITOO CRM</p>
                  <h1 style={{ margin: "0 0 28px", fontSize: 24, lineHeight: "1.3", color: palette.navy }}>{heading}</h1>
                  {children}
                  <table role="presentation" cellPadding="0" cellSpacing="0" style={{ ...table, marginTop: 28 }}><tbody><tr><td align="center" style={{ backgroundColor: palette.gold, borderRadius: 6 }}>
                    <a href={actionUrl} style={{ display: "block", padding: "16px 12px", fontSize: 16, fontWeight: 700, lineHeight: "1.5", color: palette.navy, textDecoration: "none" }}>{actionLabel} →</a>
                  </td></tr></tbody></table>
                </td></tr>
                <tr><td style={{ padding: "20px 24px", fontSize: 12, color: palette.muted }}>
                  <p style={{ margin: "0 0 12px" }}>{footer}</p>
                  <p style={{ margin: 0 }}>Echipa Habitoo</p>
                </td></tr>
              </tbody>
            </table>
          </td></tr></tbody>
        </table>
      </Body>
    </Html>
  );
}

export async function renderHabitooEmail(props: HabitooEmailProps) {
  return render(<HabitooEmail {...props} />);
}

export interface ChatEmailData {
  senderName: string;
  agencyName: string;
  avatarUrl?: string | null;
  agencyLogoUrl?: string | null;
  message: string;
  unreadCount: number;
  conversationUrl: string;
}

export const CHAT_EMAIL_FOOTER = "Primești acest email pentru că ai un mesaj necitit de peste 15 minute în Habitoo";

export function chatEmailProps(data: ChatEmailData): HabitooEmailProps {
  const message = chatMessagePreview(data.message);
  const more = additionalChatMessages(data.unreadCount);
  return {
    preview: `${data.senderName}: ${message}`,
    heading: "Ai un mesaj nou",
    actionLabel: "Răspunde în Habitoo",
    actionUrl: data.conversationUrl,
    footer: CHAT_EMAIL_FOOTER,
    children: <>
      <table role="presentation" cellPadding="0" cellSpacing="0" style={{ ...table, tableLayout: "fixed" }}><tbody><tr>
        <td width="72" style={{ verticalAlign: "top", paddingRight: 16 }}>
          {data.avatarUrl ? <img src={data.avatarUrl} alt={`Fotografia de profil a lui ${data.senderName}`} width="56" height="56" style={{ display: "block", borderRadius: "50%", objectFit: "cover", border: 0 }} /> :
            <table role="presentation" width="56" cellPadding="0" cellSpacing="0"><tbody><tr><td align="center" width="56" height="56" style={{ backgroundColor: palette.avatar, color: palette.paper, borderRadius: "50%", fontSize: 19, fontWeight: 700 }}>{initials(data.senderName)}</td></tr></tbody></table>}
        </td>
        <td style={{ ...copy, verticalAlign: "middle" }}>
          <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 17, lineHeight: "1.4" }}>{data.senderName}</p>
          <p style={{ margin: 0, color: palette.muted, fontSize: 13, lineHeight: "1.5" }}>
            {data.agencyLogoUrl ? <img src={data.agencyLogoUrl} alt={`Logo ${data.agencyName}`} width="20" height="20" style={{ verticalAlign: "middle", objectFit: "contain", marginRight: 6 }} /> : null}
            {data.agencyName}
          </p>
        </td>
      </tr></tbody></table>
      <table role="presentation" cellPadding="0" cellSpacing="0" style={{ ...table, marginTop: 24, tableLayout: "fixed" }}><tbody><tr><td style={{ ...copy, padding: "20px", borderRadius: "0 8px 8px 8px", backgroundColor: palette.bubble, fontSize: 15, whiteSpace: "pre-wrap" }}>{message}</td></tr></tbody></table>
      {more ? <p style={{ margin: "10px 0 0", color: palette.muted, fontSize: 12 }}>și încă {more} {more === 1 ? "mesaj" : "mesaje"}</p> : null}
    </>,
  };
}

export function chatEmailText(data: ChatEmailData, subject: string) {
  const more = additionalChatMessages(data.unreadCount);
  return `${subject}.\n\n${chatMessagePreview(data.message)}${more ? `\nși încă ${more} ${more === 1 ? "mesaj" : "mesaje"}` : ""}\n\nRăspunde în Habitoo: ${data.conversationUrl}\n\n${CHAT_EMAIL_FOOTER}`;
}