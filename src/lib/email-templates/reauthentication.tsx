import * as React from "react";

import { Section, Text } from "@react-email/components";

import { EmailLayout, brand, paragraph } from "./layout";

interface ReauthenticationEmailProps {
  token: string;
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <EmailLayout
    preview="Codul tău de verificare Habitoo"
    heading="Confirmă că ești tu"
    note="Dacă nu ai cerut acest cod, poți ignora emailul. Nu îl trimite nimănui."
  >
    <Text style={paragraph}>
      Folosește codul de mai jos pentru a confirma acțiunea din contul tău Habitoo:
    </Text>
    <Section style={codeBox}>
      <Text style={codeStyle}>{token}</Text>
    </Section>
    <Text style={paragraph}>Codul expiră în scurt timp.</Text>
  </EmailLayout>
);

export default ReauthenticationEmail;

const codeBox = {
  backgroundColor: "#F6F7F9",
  border: `1px solid ${brand.line}`,
  borderRadius: "10px",
  padding: "14px 18px",
  margin: "0 0 18px",
};
const codeStyle = {
  fontFamily: "Courier, monospace",
  fontSize: "26px",
  letterSpacing: "6px",
  fontWeight: "bold" as const,
  color: brand.navy,
  margin: "0",
};
