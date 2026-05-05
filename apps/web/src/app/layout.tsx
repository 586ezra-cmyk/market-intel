import type { Metadata, Viewport } from 'next'
import { Heebo } from 'next/font/google'
import Script from 'next/script'
import './globals.css'

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  variable: '--font-heebo',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'מערכת מסחר חכמה | ICT + Wyckoff',
  description: 'מערכת מודיעין שוק חכמה — ICT, Wyckoff, Smart Money',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'מסחר' },
}

export const viewport: Viewport = {
  themeColor: '#0f1117',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className="dark">
      <head>
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icons/icon-512x512.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className={`${heebo.variable} font-sans bg-surface text-white antialiased`}>
        {children}
        {/* Service Worker registration */}
        <Script id="register-sw" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js', { scope: '/' })
                  .then(function(reg) { console.log('SW registered:', reg.scope); })
                  .catch(function(err) { console.warn('SW registration failed:', err); });
              });
            }
          `}
        </Script>
      </body>
    </html>
  )
}
