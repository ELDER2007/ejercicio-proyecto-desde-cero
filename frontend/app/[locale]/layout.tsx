import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { SITE } from "@/lib/seo";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { AlternatesProvider } from "@/components/layout/alternates";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { AssistantChat } from "@/components/assistant/AssistantChat";
import "../globals.css";

const CLIENT_NAMESPACES = ["assistant", "common", "nav", "course", "booking", "auth", "errors", "account", "admin", "fakePay"];

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo" });
  return {
    metadataBase: new URL(SITE),
    // Verificación de propiedad en Google Search Console (método "etiqueta HTML"). Se rellena con GOOGLE_SITE_VERIFICATION.
    verification: process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : undefined,
    title: { default: t("homeTitle"), template: "%s · Tallerya" },
    description: t("homeDesc"),
    openGraph: { siteName: "Tallerya", type: "website", locale: locale === "es" ? "es_CO" : "en_US" },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "common" });
  // Solo enviamos al navegador los textos que usan los componentes de cliente (menos bytes por página).
  const all = await getMessages();
  const messages = Object.fromEntries(CLIENT_NAMESPACES.filter((n) => n in all).map((n) => [n, all[n as keyof typeof all]]));

  return (
    <html lang={locale}>
      <body className="min-h-screen">
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>
            <AlternatesProvider>
              <a
                href="#main"
                className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface-2 focus:px-4 focus:py-2"
              >
                {t("skip")}
              </a>
              <Header />
              <main id="main" className="mx-auto max-w-6xl px-4 py-8">
                {children}
              </main>
              <Footer />
              <AssistantChat />
            </AlternatesProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
