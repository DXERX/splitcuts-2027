"use client";

import { Container } from "@/components/ui/Container";
import { TamaraBadge } from "@/components/ui/TamaraBadge";
import { TAMARA_MIN_BOOKING_SAR } from "@/lib/payments/tamaraEligibility";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/** Same promo shown on the booking confirmation once a total qualifies --
 * repeated here on the homepage so it sells the option before anyone's even
 * picked a service. */
export function TamaraStrip() {
  const { t } = useLanguage();
  return (
    <section className="hairline-t bg-ink-950 py-14 md:py-20">
      <Container wide className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
        <div>
          <span className="tag-number text-ink-600">{t("tamara.tag")}</span>
          <p className="mt-3 font-display text-3xl uppercase text-paper md:text-4xl">
            {t("tamara.headline")} <TamaraBadge className="align-middle" />
          </p>
        </div>

        <p className="max-w-sm font-sans text-sm text-ink-400">
          {t("tamara.body", { min: TAMARA_MIN_BOOKING_SAR })}
        </p>
      </Container>
    </section>
  );
}
