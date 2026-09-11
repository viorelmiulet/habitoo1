import * as React from "react";

import { Text } from "@react-email/components";

import { EmailLayout, PrimaryButton, paragraph, strongText } from "./layout";

interface InviteEmailProps {
  siteName: string;
  siteUrl: string;
  confirmationUrl: string;
  /** Numele agenției care face invitația, când e cunoscut. */
  agencyName?: string;
}

export const InviteEmail = ({ siteName, confirmationUrl, agencyName }: InviteEmailProps) => (
  <EmailLayout
    preview={
      agencyName
        ? `${agencyName} te invită în echipa sa pe ${siteName}`
        : `Ai fost invitat în ${siteName}`
    }
    heading={agencyName ? `${agencyName} te invită în echipă` : "Ai fost invitat în echipă"}
    note="Dacă nu te așteptai la această invitație, poți ignora emailul — contul nu se activează fără acțiunea ta."
  >
    <Text style={paragraph}>Bună,</Text>
    <Text style={paragraph}>
      {agencyName ? (
        <>
          Administratorul agenției <strong>{agencyName}</strong> ți-a creat un cont de agent în{" "}
          {siteName} și te-a adăugat în echipa agenției.
        </>
      ) : (
        <>
          Administratorul agenției ți-a creat un cont de agent în {siteName} și te-a adăugat în
          echipa agenției.
        </>
      )}
    </Text>
    <Text style={strongText}>
      Mai ai un singur pas: îți setezi parola și intri direct în contul tău.
    </Text>
    <Text style={paragraph}>
      După ce îți setezi parola, vei avea acces la proprietățile, contactele, cererile și calendarul
      agenției, în funcție de drepturile primite.
    </Text>
    <PrimaryButton href={confirmationUrl}>Setează parola și intră în cont</PrimaryButton>
  </EmailLayout>
);

export default InviteEmail;
