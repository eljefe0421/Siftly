import type { Metadata } from 'next'
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import Nav from '@/components/nav'
import CommandPalette from '@/components/command-palette'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space',
  weight: ['400', '500', '600', '700'],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
  weight: ['400', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Xtract',
  description: 'Your Twitter bookmarks, organized and searchable.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      {/* Anti-flash: apply stored theme before React hydrates */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='light')document.documentElement.classList.add('light');}catch(e){}})()` }} />
      </head>
      <body className="flex min-h-screen bg-black text-[#cddad2] antialiased">
        <Nav />
        <main className="flex-1 min-w-0 overflow-auto">
          {children}
        </main>
        <CommandPalette />
      </body>
    </html>
  )
}
