import type { Metadata } from "next";
import "./globals.css";
import "./shop.css";
import "./admin.css";
import "./responsive.css";
import { StoreProvider } from "@/components/store-provider";

export const metadata: Metadata = {
  title: "Cocoa Local — Mumbai’s neighbourhood chocolate shop",
  description:
    "Chocolate favourites, thoughtful gifts, and little everyday treats. Delivered locally across Mumbai.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
