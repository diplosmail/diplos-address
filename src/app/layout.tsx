import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Diplos Address",
  description: "Campaign-based address scraping and verification tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-border bg-white">
          <div className="mx-auto max-w-[1600px] flex items-center justify-between px-6 h-14">
            <a href="/" className="text-lg font-semibold tracking-tight">
              Diplos Address
            </a>
            <nav className="flex gap-6 text-sm">
              <a href="/" className="text-muted hover:text-foreground transition-colors">
                Campaigns
              </a>
              <a href="/settings" className="text-muted hover:text-foreground transition-colors">
                Settings
              </a>
            </nav>
          </div>
        </header>
        <main className="flex-1">
          <div className="mx-auto max-w-[1600px] px-6 py-8">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
