import type { Metadata } from "next";
import { Martian_Mono, IBM_Plex_Sans } from "next/font/google";
import { PageTransitionProvider } from "@/components/page-transition";
import "./globals.css";

// Display/mono lead — per project-standards/01-frontend.md §7, Geist is
// explicitly banned as a sole/primary typeface (too overused in AI-generated
// UI to read as distinctive). Martian Mono's geometric, technical character
// fits the dev-portfolio register without being one of the flagged defaults.
const martianMono = Martian_Mono({
  variable: "--font-martian-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

// Body — same rationale; swapped off Geist Sans.
const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  // Falls back to localhost until NEXT_PUBLIC_SITE_URL is set on deploy —
  // without it, OG image URLs resolve to localhost even in production.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001"),
  title: "Franz Adriene R. Aclon — Full-Stack Developer",
  description:
    "Full-stack and backend development — web applications, integrations, and the systems behind them.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${martianMono.variable} ${ibmPlexSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-fg">
        <PageTransitionProvider>{children}</PageTransitionProvider>
      </body>
    </html>
  );
}
