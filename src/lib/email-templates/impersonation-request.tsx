import * as React from "react";

import { Link, Text } from "@react-email/components";

import { EmailLayout, PrimaryButton, brand, paragraph, strongText } from "./layout";

interface ImpersonationRequestEmailProps {
  siteName: string;
  appUrl: string;
  /** Link direct de aprobare, valabil fără autentificare, o singură dată. */
  approveUrl: string;
  /** Link direct de respingere, cu același token de unică folosință. */
  rejectUrl: string;
  fullName?: string;
  requesterName: string;
  reason: string;
}

export const ImpersonationRequestEmail = ({
  siteName,
  appUrl,
  approveUrl,
  rejectUrl,
  fullName,
  requesterName,
  reason,
}: ImpersonationRequestEmailProps) => (
  <EmailLayout
    preview={`Cerere de acces temporar la contul tău ${siteName}`}
    heading="Cerere de acces temporar la contul tău"
    note="Dacă nu recunoști această cerere, respinge-o din linkul de mai sus și scrie-ne la contact@habitoo.ro."
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

    <PrimaryButton href={approveUrl}>Aprob accesul pentru 24 de ore</PrimaryButton>

    <Text style={paragraph}>
      Nu vrei să acorzi accesul?{" "}
      <Link href={rejectUrl} style={{ color: brand.navy, fontWeight: 600 }}>
        Respinge cererea
      </Link>
      .
    </Text>
    <Text style={paragraph}>
      Linkurile funcționează o singură dată, fără să fie nevoie să te autentifici, și expiră odată cu
      cererea — în 48 de ore. Dacă poți intra în cont, găsești aceeași cerere în{" "}
      <Link href={appUrl} style={{ color: brand.navy }}>
        Setări → Acces la cont
      </Link>
      .
    </Text>
  </EmailLayout>
);

export default ImpersonationRequestEmail;
