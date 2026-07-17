import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mapping and Metadata Platform",
  description: "Enterprise metadata management & governance control plane.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-line bg-paper/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/" className="font-mono text-sm font-semibold text-ink">
              Mapping and Metadata Platform
            </Link>
            <nav className="flex gap-6 text-sm text-muted">
              <Link href="/" className="hover:text-ink">Catalog</Link>
              <Link href="/registry" className="hover:text-ink">Registry</Link>
              <Link href="/model" className="hover:text-ink">Data model</Link>
              <Link href="/pipelines" className="hover:text-ink">Pipelines</Link>
              <Link href="/lineage" className="hover:text-ink">Lineage</Link>
              <Link href="/access" className="hover:text-ink">Access</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
