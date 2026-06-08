import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Agentic Tuslah",
  description: "AI API Gateway and credit system foundation"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="mn" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
