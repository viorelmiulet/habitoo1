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
  isTrial?: boolean;
}

export const SubscriptionGraceEmail = ({
  siteName,
  appUrl,
  agencyName,
  fullName,
  expiresAt,
  graceDays,
  isTrial = false,
}: SubscriptionGraceEmailProps) => (
  <EmailLayout
    preview={
      isTrial
        ? `Perioada gratuită a agenției ${agencyName} s-a încheiat — ${graceDays} zile până la suspendare`
        : `Abonamentul agenției ${agencyName} a expirat — ${graceDays} zile până la suspendare`
    }
    heading={isTrial ? "Perioada ta gratuită s-a încheiat" : "Abonamentul agenției a expirat"}
    note="Dacă abonamentul este deja activ, poți ignora acest mesaj."
  >
    <Text style={paragraph}>Bună{fullName ? ` ${fullName}` : ""},</Text>
    <Text style={paragraph}>
      {isTrial ? "Perioada gratuită de 30 de zile a agenției " : "Abonamentul agenției "}
      <strong>{agencyName}</strong> {isTrial ? "s-a încheiat pe " : "a expirat pe "}
      {expiresAt}. Contul rămâne funcțional încă {graceDays} zile în {siteName}.
    </Text>
    <Text style={strongText}>
      Dacă abonamentul nu este {isTrial ? "activat" : "reînnoit"} în acest interval, accesul la
      aplicație va fi suspendat.
    </Text>
    <Text style={paragraph}>
      Pentru activare sau reînnoire, răspunde la acest email sau scrie-ne la contact@habitoo.ro.
    </Text>
    <PrimaryButton href={appUrl}>Intră în Habitoo</PrimaryButton>
  </EmailLayout>
);

export default SubscriptionGraceEmail;
