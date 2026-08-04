import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Stampie — Karten-Designer',
  description: 'Digitale Stempelkarten für Apple Wallet und Google Wallet.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-full">{children}</body>
    </html>
  )
}
