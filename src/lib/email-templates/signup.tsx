import * as React from "react";

import { Link, Text } from "@react-email/components";

import { EmailLayout, PrimaryButton, link, paragraph, strongText } from "./layout";

interface SignupEmailProps {
  siteName: string;
  siteUrl: string;
  recipient: string;
  confirmationUrl: string;
}

export const SignupEmail = ({ siteName, recipient, confirmationUrl }: SignupEmailProps) => (
  <EmailLayout
    preview={`Confirmă adresa de email pentru ${siteName}`}
    heading="Bine ai venit în Habitoo"
    note="Dacă nu ai creat acest cont, poți ignora acest email."
  >
    <Text style={paragraph}>Bună,</Text>
    <Text style={paragraph}>
      Îți mulțumim că ți-ai creat cont în <strong>{siteName}</strong>.
    </Text>
    <Text style={strongText}>
      Confirmă adresa{" "}
      <Link href={`mailto:${recipient}`} style={link}>
        {recipient}
      </Link>{" "}
      ca să îți activăm contul.
    </Text>
    <PrimaryButton href={confirmationUrl}>Confirmă adresa de email</PrimaryButton>
  </EmailLayout>
);

export default SignupEmail;
