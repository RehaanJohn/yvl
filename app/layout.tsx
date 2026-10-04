import type { Metadata } from "next";
import { Providers } from "./providers";
import Navbar from "./components/Navbar";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "YVL — Lending that moves with the market",
  description:
    "Volatility-aware lending. Explore collateral markets and watch borrowing limits adapt to changing risk.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Navbar />
          {children}
          <Toaster theme="light" position="bottom-right" richColors />
        </Providers>
      </body>
    </html>
  );
}
