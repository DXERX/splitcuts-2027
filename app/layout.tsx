import type { Metadata } from "next";
import { Anton, Inter, Cairo } from "next/font/google";
import "./globals.css";
import { SiteChrome } from "@/components/nav/SiteChrome";
import { LanguageProvider, LOCALE_STORAGE_KEY } from "@/lib/i18n/LanguageProvider";

const display = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

const interfaceFont = Inter({
  subsets: ["latin"],
  variable: "--font-interface",
  display: "swap",
});

// Single Arabic font for both the display and interface roles (Cairo covers
// the weight range we need for both). globals.css swaps --font-display /
// --font-interface to this under [dir="rtl"], so no component's font-display
// / font-sans Tailwind classes need to change.
const arabic = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "600", "700", "900"],
  variable: "--font-ar",
  display: "swap",
});

// Falls back to a placeholder host when NEXT_PUBLIC_SITE_URL isn't set
// (local/sandbox builds) -- metadataBase just needs to be some valid
// absolute URL for Next to resolve the relative OG image path against;
// what actually reaches WhatsApp/Discord link previews in production is
// whatever NEXT_PUBLIC_SITE_URL is set to in Vercel's env vars.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://splitcuts.vercel.app";

const SITE_TITLE = "Split Cuts";
const SITE_DESCRIPTION = "Cuts. Braids. Twists. Dreads. Built for Jeddah. Book your chair in seconds.";

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  metadataBase: new URL(siteUrl),
  // This is the banner WhatsApp/Discord/iMessage/etc. show under the link
  // whenever someone shares the site -- not anything shown on the site
  // itself. Every page inherits this unless it sets its own.
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    siteName: SITE_TITLE,
    images: [{ url: "/og/split-cuts-og.jpg", width: 1600, height: 525 }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og/split-cuts-og.jpg"],
  },
};

// Every page in this app reads live, per-request state (signed-in user,
// live appointments, realtime boards) -- nothing here is meaningfully
// static. Without this, Next tries to statically prerender pages at BUILD
// time, which runs lib/supabase/client.ts's createClient() on the server
// with no request context; if the deploy's env vars aren't present at
// build time for any reason, that throws ("Your project's URL and API key
// are required...") and fails the whole build rather than just that page
// at request time. Forcing every route dynamic here means a build never
// fails over this, and it matches what this app actually is.
export const dynamic = "force-dynamic";

// Runs before hydration/paint so a returning visitor who picked Arabic never
// sees an English-LTR flash. Kept tiny and defensive (try/catch) since it
// runs outside React entirely.
const SET_LOCALE_BEFORE_PAINT = `(function(){try{var l=localStorage.getItem(${JSON.stringify(
  LOCALE_STORAGE_KEY,
)});if(l==="ar"){document.documentElement.lang="ar";document.documentElement.dir="rtl";}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${interfaceFont.variable} ${arabic.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SET_LOCALE_BEFORE_PAINT }} />
      </head>
      <body>
        <LanguageProvider>
          <SiteChrome>{children}</SiteChrome>
        </LanguageProvider>
      </body>
    </html>
  );
}
