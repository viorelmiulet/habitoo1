import * as React from "react";

import { Link, Text } from "@react-email/components";

import { EmailLayout, PrimaryButton, link, paragraph, strongText } from "./layout";

interface EmailChangeEmailProps {
  siteName: string;
  // oldEmail is the user's current address (HookData.OldEmail). For the
  // NEW-recipient half of a secure email_change fanout, `email` equals the
  // recipient (NEW), so the "from" line must render oldEmail to read
  // "from OLD to NEW" instead of "from NEW to NEW".
  oldEmail: string;
  email: string;
  newEmail: string;
  confirmationUrl: string;
}

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <EmailLayout
    preview={`Confirmă schimbarea adresei de email pentru ${siteName}`}
    heading="Confirmă noua adresă de email"
    note="Dacă nu ai cerut această schimbare, îți recomandăm să îți schimbi imediat parola."
  >
    <Text style={paragraph}>Bună,</Text>
    <Text style={paragraph}>
      Ai cerut schimbarea adresei de email a contului tău din <strong>{siteName}</strong> din{" "}
      <Link href={`mailto:${oldEmail}`} style={link}>
        {oldEmail}
      </Link>{" "}
      în{" "}
      <Link href={`mailto:${newEmail}`} style={link}>
        {newEmail}
      </Link>
      .
    </Text>
    <Text style={strongText}>
      Confirmă schimbarea ca să folosești noua adresă la autentificare.
    </Text>
    <PrimaryButton href={confirmationUrl}>Confirmă schimbarea</PrimaryButton>
  </EmailLayout>
);

export default EmailChangeEmail;
