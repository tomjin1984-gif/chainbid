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
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/chain-bid-logo-50.png", sizes: "50x50", type: "image/png" },
      { url: "/brand/chain-bid-logo-100.png", sizes: "100x100", type: "image/png" },
    ],
    shortcut: "/brand/chain-bid-logo-50.png",
    apple: "/brand/chain-bid-logo-200.png",
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
