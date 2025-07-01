import type { Metadata } from "next";

import { ReactPlugin } from "@stagewise-plugins/react";
import { StagewiseToolbar } from "@stagewise/toolbar-next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getLocale } from "next-intl/server";

import "~/css/globals.css";

import { Geist, Geist_Mono } from "next/font/google";

import { SEO_CONFIG } from "~/app";
import { CartProvider } from "~/lib/hooks/use-cart";
import { Footer } from "~/components/footer";
import { Header } from "~/components/header/header";
import { ThemeProvider } from "~/components/theme-provider";
import { Toaster } from "~/components/ui/sonner";
import { ConditionalFooter } from "~/components/conditional-footer";
import { ErrorBoundary } from "~/components/error-boundary";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const currentLocale = await getLocale();
  const safeLocale = (currentLocale as "en" | "zh") || "en";

  console.log(
    "Layout metadata - detected locale:",
    currentLocale,
    "safe locale:",
    safeLocale
  );

  return {
    title: SEO_CONFIG.fullName[safeLocale] || SEO_CONFIG.fullName.en,
    description:
      SEO_CONFIG.description[safeLocale] || SEO_CONFIG.description.en,
    keywords: SEO_CONFIG.keywords[safeLocale] || SEO_CONFIG.keywords.en,
  };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`
          ${geistSans.variable}
          ${geistMono.variable}
          min-h-screen bg-gradient-to-br from-white to-slate-100
          text-neutral-900 antialiased
          selection:bg-primary/80
          dark:from-neutral-950 dark:to-neutral-900 dark:text-neutral-100
        `}
      >
        <ErrorBoundary>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            disableTransitionOnChange
            enableSystem
          >
            <CartProvider>
              <NextIntlClientProvider messages={messages}>
                <Header showAuth={true} />
                <main>{children}</main>
                <ConditionalFooter />
                <Toaster />
                <StagewiseToolbar config={{ plugins: [ReactPlugin] }} />
              </NextIntlClientProvider>
            </CartProvider>
          </ThemeProvider>
        </ErrorBoundary>
        <SpeedInsights />
      </body>
    </html>
  );
}
