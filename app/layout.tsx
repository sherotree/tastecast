import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Fraunces } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
});

const sans = Atkinson_Hyperlegible({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "TasteCast",
    template: "%s · TasteCast",
  },
  description:
    "Describe a vibe or a favorite. TasteCast resolves it in Qloo’s taste graph and returns a cross-domain cast with the affinity to back it up.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>
        <div className="frame">
          <header className="topbar">
            <Link href="/" className="wordmark">
              Taste<em>Cast</em>
            </Link>
            <p className="issue">Vol. 01 — The graph, not the guess</p>
            <nav className="nav">
              <Link href="/cast">Cast</Link>
              <Link href="/demo">Demo</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
