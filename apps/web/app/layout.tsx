import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Hockey Calgary standings", template: "%s · Hockey Calgary standings" },
  description:
    "Scores and standings for every Hockey Calgary Community Council league, seen from any community.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfc" },
    { media: "(prefers-color-scheme: dark)", color: "#1e2126" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA">
      <body className="min-h-screen">
        <header className="mx-auto flex max-w-3xl items-baseline justify-between gap-4 px-4 pt-5 pb-2">
          <Link href="/" className="font-semibold text-[var(--fg)] no-underline">
            Hockey Calgary standings
          </Link>
          <nav className="text-sm">
            <Link href="/leagues">All leagues</Link>
          </nav>
        </header>
        <main className="mx-auto max-w-3xl px-4 pb-12">{children}</main>
        <footer className="muted mx-auto max-w-3xl px-4 pb-8 text-xs">
          Unofficial. Scores from Hockey Calgary&apos;s TeamLinkt site; standings are computed from
          those games and may differ from official tie-breaks.
        </footer>
      </body>
    </html>
  );
}
