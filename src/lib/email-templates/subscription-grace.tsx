import * as React from "react";

import { Text } from "@react-email/components";

import { EmailLayout, PrimaryButton, paragraph, strongText } from "./layout";

interface SubscriptionGraceEmailProps {
  siteName: string;
  appUrl: string;
  agencyName: string;
  fullName?: string;
  expiresAt: string;
  graceDays: number;
}

export const SubscriptionGraceEmail = ({
  siteName,
  appUrl,
  agencyName,
  fullName,
  expiresAt,
  graceDays,
}: SubscriptionGraceEmailProps) => (
  <EmailLayout
    preview={`Abonamentul agenției ${agencyName} a expirat — ${graceDays} zile până la suspendare`}
    heading="Abonamentul agenției a expirat"
    note="Dacă ai reînnoit deja abonamentul, poți ignora acest mesaj."
  >
    <Text style={paragraph}>Bună{fullName ? ` ${fullName}` : ""},</Text>
    <Text style={paragraph}>
      Abonamentul agenției <strong>{agencyName}</strong> a expirat pe {expiresAt}. Contul rămâne
      funcțional încă {graceDays} zile în {siteName}.
    </Text>
    <Text style={strongText}>
      Dacă abonamentul nu este reînnoit în acest interval, accesul la aplicație va fi suspendat.
    </Text>
    <Text style={paragraph}>
      Pentru reînnoire, răspunde la acest email sau scrie-ne la contact@habitoo.ro.
    </Text>
    <PrimaryButton href={appUrl}>Intră în Habitoo</PrimaryButton>
  </EmailLayout>
);

export default SubscriptionGraceEmail;
