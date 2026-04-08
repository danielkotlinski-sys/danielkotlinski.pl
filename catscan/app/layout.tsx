import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CATSCAN // Market Intelligence",
  description: "Sector-wide market intelligence platform. Scan. Decode. Query.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
