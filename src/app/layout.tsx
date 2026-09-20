import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";

import { Providers } from "@/app/providers";
import { ServiceWorker } from "@/components/app/service-worker";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Recipes",
  description: "Shared recipe library, meal planner and shopping list.",
  // Makes the app installable. SPEC.md §8 Phase 8.
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Recipes", statusBarStyle: "default" },
};

/**
 * `viewport-fit=cover` plus the theme colour is what stops an installed app
 * looking like a browser tab that lost its chrome.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Providers>
            {children}
            {/*
              Lifted above the fixed bottom navigation, so a toast never lands
              underneath it. Ticking an item in a shop is exactly when the
              message matters.
            */}
            <Toaster
              offset={{ bottom: "calc(var(--bottom-nav) + 0.5rem)" }}
              mobileOffset={{ bottom: "calc(var(--bottom-nav) + 0.5rem)" }}
            />
            <ServiceWorker />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
