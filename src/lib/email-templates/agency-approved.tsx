import * as React from 'react'

import { Text } from '@react-email/components'

import { EmailLayout, PrimaryButton, paragraph, strongText } from './layout'

interface AgencyApprovedEmailProps {
  siteName: string
  appUrl: string
  agencyName: string
  fullName?: string
}

export const AgencyApprovedEmail = ({
  siteName,
  appUrl,
  agencyName,
  fullName,
}: AgencyApprovedEmailProps) => (
  <EmailLayout
    preview={`Agenția ${agencyName} a fost aprobată — bine ai venit în ${siteName}`}
    heading="Agenția ta a fost aprobată"
    note="Dacă nu ai trimis tu această cerere de înscriere, te rugăm să ne scrii la contact@habitoo.ro."
  >
    <Text style={paragraph}>Bună{fullName ? ` ${fullName}` : ''},</Text>
    <Text style={paragraph}>
      Cererea de înscriere a agenției <strong>{agencyName}</strong> a fost verificată și
      aprobată. Contul tău de administrator este activ, iar agenția este pregătită în{' '}
      {siteName}.
    </Text>
    <Text style={strongText}>Poți intra direct în aplicație și începe să lucrezi.</Text>
    <Text style={paragraph}>
      Dacă sesiunea a expirat, te rugăm să te autentifici din nou cu emailul și parola
      contului tău.
    </Text>
    <PrimaryButton href={appUrl}>Intră în Habitoo</PrimaryButton>
  </EmailLayout>
)

export default AgencyApprovedEmail
