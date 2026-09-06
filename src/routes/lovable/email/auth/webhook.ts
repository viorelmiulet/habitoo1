import * as React from 'react'
import { createAuthEmailHandler } from '@lovable.dev/email-js'
import { createFileRoute } from '@tanstack/react-router'
import { SignupEmail } from '@/lib/email-templates/signup'
import { InviteEmail } from '@/lib/email-templates/invite'
import { MagicLinkEmail } from '@/lib/email-templates/magic-link'
import { RecoveryEmail } from '@/lib/email-templates/recovery'
import { EmailChangeEmail } from '@/lib/email-templates/email-change'
import { ReauthenticationEmail } from '@/lib/email-templates/reauthentication'

// Configuration
const SITE_NAME = "Habitoo CRM"
const SENDER_DOMAIN = "notify.habitoo.ro"
const ROOT_DOMAIN = "habitoo.ro"
const FROM_DOMAIN = "habitoo.ro"
const SITE_URL = `https://${ROOT_DOMAIN}`

/**
 * Numele agenției care invită, transmis de `inviteAgent` prin `redirect_to`.
 * Payloadul webhookului nu include metadatele utilizatorului, deci îl citim din URL.
 */
function agencyFromUrl(rawUrl: string): string | undefined {
  try {
    const url = new URL(rawUrl)
    const redirect = url.searchParams.get('redirect_to')
    if (!redirect) return undefined
    const agency = new URL(redirect, SITE_URL).searchParams.get('agency')?.trim()
    return agency || undefined
  } catch {
    return undefined
  }
}

// The SDK handler owns verification, dispatch, and retry semantics; this file
// owns only the email decisions: subjects, templates, and per-type props.
export const Route = createFileRoute("/lovable/email/auth/webhook")({
  server: {
    handlers: {
      POST: ({ request }) => {
        const handler = createAuthEmailHandler({
          apiKey: process.env['LOVABLE_API_KEY']!,
          from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
          senderDomain: SENDER_DOMAIN,
          sendUrl: process.env['LOVABLE_SEND_URL'],
          emails: {
            signup: {
              subject: 'Confirmă adresa de email pentru Habitoo CRM',
              render: (data) =>
                React.createElement(SignupEmail, {
                  siteName: SITE_NAME,
                  siteUrl: SITE_URL,
                  recipient: data.email,
                  confirmationUrl: data.url,
                }),
            },
            invite: (data) => {
              const agencyName = agencyFromUrl(data.url)
              return {
                subject: agencyName
                  ? `${agencyName} te invită în echipa sa pe Habitoo CRM`
                  : 'Ai fost invitat în echipa unei agenții pe Habitoo CRM',
                element: React.createElement(InviteEmail, {
                  siteName: SITE_NAME,
                  siteUrl: SITE_URL,
                  confirmationUrl: data.url,
                  agencyName,
                }),
              }
            },
            magiclink: {
              subject: 'Linkul tău de autentificare în Habitoo CRM',
              render: (data) =>
                React.createElement(MagicLinkEmail, {
                  siteName: SITE_NAME,
                  confirmationUrl: data.url,
                }),
            },
            recovery: {
              subject: 'Resetează parola contului Habitoo CRM',
              render: (data) =>
                React.createElement(RecoveryEmail, {
                  siteName: SITE_NAME,
                  confirmationUrl: data.url,
                }),
            },

            email_change: {
              subject: 'Confirmă noua adresă de email — Habitoo CRM',
              render: (data) =>
                React.createElement(EmailChangeEmail, {
                  siteName: SITE_NAME,
                  oldEmail: data.old_email ?? '',
                  email: data.email,
                  newEmail: data.new_email ?? '',
                  confirmationUrl: data.url,
                }),
            },
            reauthentication: {
              subject: 'Codul tău de verificare Habitoo CRM',
              render: (data) =>
                React.createElement(ReauthenticationEmail, { token: data.token ?? '' }),
            },
          },
        })
        return handler(request)
      },
    },
  },
})
