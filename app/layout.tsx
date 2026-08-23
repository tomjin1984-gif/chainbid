import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: {
    default: "chain.bid - The Crypto Leaderboard",
    template: "%s - chain.bid",
  },
  description:
    "A paid crypto leaderboard where verified USDT bids determine ranking.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://chain.bid"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "chain.bid - The Crypto Leaderboard",
    description:
      "Crypto projects compete for visibility. Higher verified USDT bids rank higher.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "chain.bid crypto leaderboard preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "chain.bid - The Crypto Leaderboard",
    description:
      "Crypto projects compete for visibility. Higher verified USDT bids rank higher.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="dark light" />
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
