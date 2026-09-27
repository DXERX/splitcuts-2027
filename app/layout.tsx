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

export const metadata: Metadata = {
  title: "Split Cuts",
  description: "Cuts. Braids. Twists. Dreads. Built for Jeddah. Book your chair in seconds.",
};

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
