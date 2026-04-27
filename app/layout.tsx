import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/lib/auth-provider';
import { Toaster } from '@/components/ui/toaster';
import Link from 'next/link';
import { Terminal } from 'lucide-react';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: 'AI Story Generator',
  description: 'Generate stories and images with AI',
  openGraph: {
    images: [
      {
        url: '/og-default.png', // Add a default open graph image to your public/ folder
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    images: [
      {
        url: '/og-default.png',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen flex flex-col`}>
        <AuthProvider>
          {/* Cyberpunk Global Navigation */}
          <header className="sticky top-0 z-50 w-full border-b border-cyan-900/50 bg-black/80 backdrop-blur-md shadow-[0_0_15px_rgba(6,182,212,0.15)]">
            <div className="absolute bottom-0 left-0 h-[1px] w-full bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50" />
            <div className="container mx-auto flex h-14 items-center justify-between px-4">
              <div className="flex items-center gap-2 group">
                <Terminal className="h-5 w-5 text-cyan-500 group-hover:animate-pulse drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                <Link href="/" className="font-mono text-lg font-bold tracking-widest text-cyan-400 hover:text-cyan-300 transition-colors drop-shadow-[0_0_8px_rgba(6,182,212,0.5)] uppercase">
                  SYS.STORY_GEN
                </Link>
              </div>
              <nav className="flex items-center gap-6 font-mono text-xs tracking-widest">
                <Link href="/dashboard" className="text-cyan-100/70 hover:text-cyan-400 hover:drop-shadow-[0_0_5px_rgba(6,182,212,0.8)] transition-all uppercase">
                  [ DASHBOARD ]
                </Link>
              </nav>
            </div>
          </header>
          <main className="flex-1 relative">
            {children}
          </main>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
