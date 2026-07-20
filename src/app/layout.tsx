import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";
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
  // Meta Business Settings -> Brand Safety -> Domains (meta-tag verification
  // method for afravisibility.com). Static value, not env-driven — it's a
  // one-time domain claim, not a per-environment secret.
  other: {
    "facebook-domain-verification": "md9fo7o8uligco3h2z0d61z9f1kgfm",
  },
};

const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

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
      <body className="min-h-full flex flex-col">
        {META_PIXEL_ID && (
          <>
            {/* Base Meta pixel — loads on every route. InitiateCheckout/Purchase
                fire elsewhere (founding CTA, /welcome); this only does
                init + PageView. afterInteractive keeps it off the critical
                render path (see the Lighthouse pass this app already went
                through) while still firing before the user can navigate away. */}
            <Script id="meta-pixel-base" strategy="afterInteractive">
              {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');`}
            </Script>
            <noscript>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                height="1"
                width="1"
                style={{ display: "none" }}
                alt=""
                src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
              />
            </noscript>
          </>
        )}
        {children}
        <Analytics />
      </body>
    </html>
  );
}
