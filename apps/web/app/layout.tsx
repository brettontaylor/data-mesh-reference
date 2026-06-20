import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "DEAL Control Tower",
  description: "Enterprise metadata management & governance control plane.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-line bg-paper/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/" className="font-mono text-sm font-semibold text-ink">
              DEAL Control Tower
            </Link>
            <nav className="flex gap-6 text-sm text-muted">
              <Link href="/" className="hover:text-ink">Catalog</Link>
              <Link href="/registry" className="hover:text-ink">Registry</Link>
              <Link href="/pipelines" className="hover:text-ink">Pipelines</Link>
              <Link href="/access" className="hover:text-ink">Access</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
