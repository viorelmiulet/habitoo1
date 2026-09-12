import * as React from "react";

import { Text } from "@react-email/components";

import { EmailLayout, PrimaryButton, paragraph, strongText } from "./layout";

interface PortalListingExpiredEmailProps {
  siteName: string;
  propertyUrl: string;
  propertyTitle: string;
  portalName: string;
  fullName?: string;
  /** Republicarea automată a reușit (comutatorul agenției este activ). */
  republished: boolean;
  /** Explicație scurtă când nu s-a republicat automat. */
  reason?: string;
}

export const PortalListingExpiredEmail = ({
  siteName,
  propertyUrl,
  propertyTitle,
  portalName,
  fullName,
  republished,
  reason,
}: PortalListingExpiredEmailProps) => (
  <EmailLayout
    preview={
      republished
        ? `Anunțul ${propertyTitle} a expirat pe ${portalName} și a fost republicat automat`
        : `Anunțul ${propertyTitle} a expirat pe ${portalName}`
    }
    heading={republished ? "Anunț expirat și republicat automat" : "Anunț expirat pe portal"}
  >
    <Text style={paragraph}>Bună{fullName ? ` ${fullName}` : ""},</Text>
    <Text style={paragraph}>
      Anunțul <strong>{propertyTitle}</strong> a expirat pe {portalName}.
    </Text>
    {republished ? (
      <Text style={strongText}>
        A fost republicat automat, conform setării agenției. Nu trebuie să faci nimic.
      </Text>
    ) : (
      <Text style={strongText}>
        Republică-l manual din fila Publicare a ofertei.
        {reason ? ` ${reason}` : ""}
      </Text>
    )}
    <PrimaryButton href={propertyUrl}>Deschide oferta în {siteName}</PrimaryButton>
  </EmailLayout>
);

export default PortalListingExpiredEmail;
