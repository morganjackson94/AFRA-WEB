import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Display serif — Flho warmth. Optical sizing on for editorial headings.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

// Resolves relative OG/social image URLs against the real deployed origin.
// Reuses APP_BASE_URL (same var Stripe redirects + hiring links use) rather
// than a second hardcoded domain — see .env.example for the production value.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_BASE_URL ?? "http://localhost:3000"),
  title: "AFRA — Stop losing good applicants",
  description:
    "You already get applicants on Instagram. We answer every one in seconds and book them right into your calendar.",
};

// One intentional dark world: emits <meta name="color-scheme" content="dark"> on
// every route so the browser/OS UA chrome matches the periwinkle ground and
// nothing fights it. (Inverse of the earlier light-lock — deliberate, app-wide.)
export const viewport: Viewport = {
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
