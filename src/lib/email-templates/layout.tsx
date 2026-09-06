import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

// Stable public logo URL for email clients (PNG for maximum compatibility).
export const LOGO_URL = 'https://habitoo.ro/assets/habitoo-logo.png'
export const SITE_URL = 'https://habitoo.ro'

// Brand palette (navy / gold), aligned with the app and the public site.
export const brand = {
  navy: '#16223C',
  gold: '#C9A227',
  ink: '#1F2937',
  muted: '#55575d',
  faint: '#8A8F98',
  line: '#E6E8EC',
  surface: '#F6F7F9',
}

interface EmailLayoutProps {
  preview: string
  heading: string
  children: React.ReactNode
  /** Optional footer note above the standard signature block. */
  note?: React.ReactNode
}

export const EmailLayout = ({
  preview,
  heading,
  children,
  note,
}: EmailLayoutProps) => (
  <Html lang="ro" dir="ltr">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>{preview}</Preview>
    <Body style={main}>
      <Container style={outer}>
        <Section style={header}>
          <Link href={SITE_URL}>
            <Img src={LOGO_URL} alt="Habitoo CRM" width="168" height="80" style={logo} />
          </Link>
        </Section>
        <Container className="dm-card" style={card}>
          <Section style={accent} />
          <Section style={cardInner}>
            <Heading style={h1}>{heading}</Heading>
            {children}
          </Section>
        </Container>
        {note ? <Text style={footer}>{note}</Text> : null}
        <Hr style={hr} />
        <Text style={signature}>
          Cu drag,
          <br />
          <span style={{ color: brand.navy, fontWeight: 'bold' }}>Echipa Habitoo</span>
        </Text>
        <Text style={legal}>
          Habitoo CRM — platforma de management imobiliar pentru agenții din România.
          <br />
          <Link href={SITE_URL} style={legalLink}>
            habitoo.ro
          </Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

/** Butonul principal de acțiune, identic în toate emailurile. */
export const PrimaryButton = ({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) => (
  <>
    <Button className="dm-btn" style={button} href={href}>
      {children}
    </Button>
    <Text style={fallback}>
      Dacă butonul nu funcționează, copiază acest link în browser:
      <br />
      <Link href={href} style={fallbackLink}>
        {href}
      </Link>
    </Text>
  </>
)

export const paragraph = {
  fontSize: '15px',
  color: brand.muted,
  lineHeight: '1.6',
  margin: '0 0 16px',
}

export const strongText = {
  ...paragraph,
  color: brand.ink,
}

export const link = { color: brand.navy, textDecoration: 'underline' }

const main = {
  backgroundColor: brand.surface,
  fontFamily: 'Helvetica, Arial, sans-serif',
  margin: '0',
  padding: '24px 0',
}
const outer = { width: '100%', maxWidth: '560px', padding: '0 16px' }
const header = { padding: '4px 0 20px' }
const logo = { display: 'block' }
const card = {
  backgroundColor: '#ffffff',
  border: `1px solid ${brand.line}`,
  borderRadius: '14px',
  overflow: 'hidden' as const,
  width: '100%',
}
const accent = { backgroundColor: brand.gold, height: '4px', lineHeight: '4px' }
const cardInner = { padding: '28px 28px 24px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: brand.navy,
  lineHeight: '1.3',
  margin: '0 0 18px',
}
const button = {
  backgroundColor: brand.navy,
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold' as const,
  border: `1px solid ${brand.navy}`,
  borderRadius: '10px',
  padding: '13px 24px',
  textDecoration: 'none',
  display: 'inline-block',
}
const fallback = {
  fontSize: '12px',
  color: brand.faint,
  lineHeight: '1.6',
  margin: '22px 0 0',
  wordBreak: 'break-all' as const,
}
const fallbackLink = { color: brand.faint, textDecoration: 'underline' }
const footer = {
  fontSize: '13px',
  color: brand.faint,
  lineHeight: '1.6',
  margin: '18px 4px 0',
}
const hr = { borderColor: brand.line, margin: '22px 4px' }
const signature = {
  fontSize: '13px',
  color: brand.muted,
  lineHeight: '1.6',
  margin: '0 4px 14px',
}
const legal = {
  fontSize: '11px',
  color: brand.faint,
  lineHeight: '1.6',
  margin: '0 4px',
}
const legalLink = { color: brand.faint, textDecoration: 'underline' }
// Rendered as a text child, which React may HTML-escape: keep this CSS free of >, &, and quotes.
const darkModeCss = `
  @media (prefers-color-scheme: dark) {
    .dm-btn { background-color: #C9A227 !important; color: #16223C !important; border-color: #C9A227 !important; }
  }
  [data-ogsc] .dm-btn { background-color: #C9A227 !important; color: #16223C !important; border-color: #C9A227 !important; }
  [data-ogsb] .dm-btn { background-color: #C9A227 !important; color: #16223C !important; border-color: #C9A227 !important; }
`
