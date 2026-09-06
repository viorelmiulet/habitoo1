import * as React from 'react'

import { Text } from '@react-email/components'

import { EmailLayout, PrimaryButton, paragraph, strongText } from './layout'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ siteName, confirmationUrl }: RecoveryEmailProps) => (
  <EmailLayout
    preview={`Resetează parola contului ${siteName}`}
    heading="Resetează-ți parola"
    note="Dacă nu ai cerut resetarea parolei, poți ignora acest email — parola actuală rămâne neschimbată."
  >
    <Text style={paragraph}>Bună,</Text>
    <Text style={paragraph}>
      Am primit o cerere de resetare a parolei pentru contul tău din{' '}
      <strong>{siteName}</strong>.
    </Text>
    <Text style={strongText}>
      Apasă butonul de mai jos ca să îți alegi o parolă nouă. Linkul este valabil o
      perioadă limitată.
    </Text>
    <PrimaryButton href={confirmationUrl}>Setează o parolă nouă</PrimaryButton>
  </EmailLayout>
)

export default RecoveryEmail
