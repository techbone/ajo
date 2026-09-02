import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { AjoProvider } from "@/components/ajo-provider";
import { BOOT_SCRIPT } from "./boot-script";
import "./globals.css";

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700"],
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const description =
  "A rotating savings circle on USDT. Ten people put in $50 a week, one person takes the whole pot, and it rotates until everyone has had their turn.";

export const metadata: Metadata = {
  metadataBase: new URL("https://ajo-kappa.vercel.app"),
  title: "Ajo — nobody holds the money",
  description,
  openGraph: {
    title: "Ajo — nobody holds the money",
    description,
    siteName: "Ajo",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ajo — nobody holds the money",
    description,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // A WebView that pinch-zooms feels broken, not flexible.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} h-full antialiased`}
      // Nimiq Pay injects --safe-area-inset-* onto <html> before React
      // hydrates, which React otherwise reports as a mismatch it cannot patch.
      suppressHydrationWarning
    >
      <head>
        {/* Must run before Next's runtime. See boot-script.ts for why. */}
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <AjoProvider>{children}</AjoProvider>
      </body>
    </html>
  );
}
