"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";

/** Se muestra si una página no puede cargar (p. ej. la API aún está despertando). */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("errors");
  return (
    <section role="alert" className="py-16 text-center">
      <h1 className="text-2xl font-bold">{t("wakingTitle")}</h1>
      <p className="mx-auto mt-3 max-w-xl text-muted">{t("wakingBody")}</p>
      <Button className="mt-6" onClick={reset}>
        {t("retry")}
      </Button>
    </section>
  );
}
