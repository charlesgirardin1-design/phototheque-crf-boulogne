import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Photothèque CRF Boulogne",
  description: "Photothèque interne de la Croix-Rouge française de Boulogne",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
