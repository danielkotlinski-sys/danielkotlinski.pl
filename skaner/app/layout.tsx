import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skaner Kategorii | danielkotlinski.pl",
  description: "Bezpłatna analiza konwencji komunikacyjnych w Twojej branży. Reverse engineering logiki sprzedaży i implikowanego klienta.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body className="font-body antialiased bg-beige text-text-primary">
        {children}
      </body>
    </html>
  );
}
