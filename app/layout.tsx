import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { GlobalHeader } from "@/components/global-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const themeInitScript = `
(() => {
  try {
    const storedTheme = window.localStorage.getItem("chain-bid-theme");
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    const theme = storedTheme === "light" || storedTheme === "dark"
      ? storedTheme
      : prefersLight ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {}
})();
`;

export const metadata: Metadata = {
  title: {
    default: "Chain.bid - The Crypto Leaderboard",
    template: "%s - Chain.bid",
  },
  description:
    "A paid crypto leaderboard where verified USDT bids determine ranking.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://chain.bid"),
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Chain.bid - The Crypto Leaderboard",
    description:
      "Crypto projects compete for visibility. Higher verified USDT bids rank higher.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Chain.bid crypto leaderboard preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Chain.bid - The Crypto Leaderboard",
    description:
      "Crypto projects compete for visibility. Higher verified USDT bids rank higher.",
    images: ["/og.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await headers();

  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="dark light" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <GlobalHeader />
        {children}
      </body>
    </html>
  );
}
