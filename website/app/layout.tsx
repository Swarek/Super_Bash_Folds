import type { Metadata, Viewport } from "next";
import { Anton, Space_Grotesk } from "next/font/google";
import "./globals.css";

const display = Anton({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

const body = Space_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://super-bash-folds.spry-crumb-3668.chatgpt.site"),
  title: "Super Bash Folds — Open-source platform fighter",
  description: "Fight, create, and share in an open-source platform fighter built for players and modders.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Super Bash Folds",
    title: "Super Bash Folds — Play. Create. Contribute.",
    description: "A fast open-source platform fighter for the browser, built around portable fighter and stage packs.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Super Bash Folds open fighters facing off on Verdant Grove" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Super Bash Folds — Play. Create. Contribute.",
    description: "A fast open-source platform fighter for the browser, built around portable fighter and stage packs.",
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#101d33",
  colorScheme: "light dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable}`}>{children}</body>
    </html>
  );
}
