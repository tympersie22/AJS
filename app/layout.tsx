import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AJS System",
  description: "Internal business platform for AJS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ajs-bg font-sans text-ajs-primary antialiased">{children}</body>
    </html>
  );
}
