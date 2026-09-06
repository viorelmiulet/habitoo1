import * as React from 'react'

import { Text } from '@react-email/components'

import { EmailLayout, PrimaryButton, paragraph, strongText } from './layout'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <EmailLayout
    preview={`Linkul tău de autentificare în ${siteName}`}
    heading="Linkul tău de autentificare"
    note="Dacă nu ai cerut acest link, poți ignora emailul — nimeni nu îți poate accesa contul fără el."
  >
    <Text style={paragraph}>Bună,</Text>
    <Text style={strongText}>
      Apasă butonul de mai jos ca să intri în contul tău din <strong>{siteName}</strong>.
    </Text>
    <Text style={paragraph}>
      Din motive de securitate, linkul expiră în scurt timp și poate fi folosit o
      singură dată.
    </Text>
    <PrimaryButton href={confirmationUrl}>Intră în cont</PrimaryButton>
  </EmailLayout>
)

export default MagicLinkEmail
