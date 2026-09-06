import * as React from 'react'
import { render } from '@react-email/render'
import { InviteEmail } from '@/lib/email-templates/invite'
import { SignupEmail } from '@/lib/email-templates/signup'
import { RecoveryEmail } from '@/lib/email-templates/recovery'
import { MagicLinkEmail } from '@/lib/email-templates/magic-link'
import { EmailChangeEmail } from '@/lib/email-templates/email-change'
import { ReauthenticationEmail } from '@/lib/email-templates/reauthentication'
const out = await Promise.all([
  render(React.createElement(InviteEmail, { siteName: 'Habitoo CRM', siteUrl: 'https://habitoo.ro', confirmationUrl: 'https://crm.habitoo.ro/x', agencyName: 'MVA Imobiliare' })),
  render(React.createElement(SignupEmail, { siteName: 'Habitoo CRM', siteUrl: 'https://habitoo.ro', recipient: 'a@b.ro', confirmationUrl: 'x' })),
  render(React.createElement(RecoveryEmail, { siteName: 'Habitoo CRM', confirmationUrl: 'x' })),
  render(React.createElement(MagicLinkEmail, { siteName: 'Habitoo CRM', confirmationUrl: 'x' })),
  render(React.createElement(EmailChangeEmail, { siteName: 'Habitoo CRM', oldEmail: 'a@b.ro', email: 'c@d.ro', newEmail: 'c@d.ro', confirmationUrl: 'x' })),
  render(React.createElement(ReauthenticationEmail, { token: '123456' })),
])
console.log(out.map((h) => h.length).join(' '))
console.log(out[0].includes('MVA Imobiliare'), out[0].includes('habitoo-logo.png'))
