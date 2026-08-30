import type { Metadata } from "next";
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google"

import "@workspace/ui/globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@workspace/ui/lib/utils";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { AutoFullscreen } from "@/components/auto-fullscreen";

export const metadata: Metadata = {
  title: {
    default: "LATENT — Burn-In Screening · ISRO",
    template: "%s — LATENT",
  },
  description: "AI-powered burn-in screening and anomaly detection system for ISRO spacecraft components.",
};

const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700"],
})

const fontMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontSans.variable, fontMono.variable)}
    >
      <body className="flex font-sans">
        <ThemeProvider>
          <AutoFullscreen />
          <Sidebar />
          <div className="ml-[260px] w-[calc(100%-260px)] flex flex-col min-h-screen"
            style={{ background: "var(--background)" }}
          >
            <Header />
            <main className="flex-1 p-8 overflow-x-hidden">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
