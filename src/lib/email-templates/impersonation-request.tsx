import * as React from "react";

import { Text } from "@react-email/components";

import { EmailLayout, PrimaryButton, paragraph, strongText } from "./layout";

interface ImpersonationRequestEmailProps {
  siteName: string;
  appUrl: string;
  fullName?: string;
  requesterName: string;
  reason: string;
}

export const ImpersonationRequestEmail = ({
  siteName,
  appUrl,
  fullName,
  requesterName,
  reason,
}: ImpersonationRequestEmailProps) => (
  <EmailLayout
    preview={`Cerere de acces temporar la contul tău ${siteName}`}
    heading="Cerere de acces temporar la contul tău"
    note="Dacă nu recunoști această cerere, respinge-o din aplicație și scrie-ne la contact@habitoo.ro."
  >
    <Text style={paragraph}>Bună{fullName ? ` ${fullName}` : ""},</Text>
    <Text style={paragraph}>
      <strong>{requesterName}</strong> din echipa {siteName} cere acces temporar la contul tău,
      pentru asistență și depanare.
    </Text>
    <Text style={paragraph}>
      Motivul indicat: <strong>{reason}</strong>
    </Text>
    <Text style={paragraph}>
      Dacă accepți, accesul durează <strong>24 de ore</strong> din momentul aprobării și expiră
      automat. În acest timp echipa vede aplicația exact ca tine și poate lucra în contul tău, dar nu
      poate schimba parola, emailul sau modul de autentificare. Toate acțiunile sunt jurnalizate.
    </Text>
    <Text style={strongText}>Poți revoca accesul oricând, chiar și după ce l-ai aprobat.</Text>
    <Text style={paragraph}>Cererea expiră singură dacă nu răspunzi în 48 de ore.</Text>
    <PrimaryButton href={appUrl}>Vezi cererea în aplicație</PrimaryButton>
  </EmailLayout>
);

export default ImpersonationRequestEmail;
