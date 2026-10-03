"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { Localized } from "@/components/i18n/T";
import { tamaraChargeTotal } from "@/lib/payments/tamaraEligibility";
import { isValidSaudiPhone, toE164Saudi } from "@/lib/phone";

export interface PackageInfo {
  id: string;
  nameEn: string;
  nameAr: string | null;
  price: number;
  sessionCount: number;
}

export type CustomerPackageStatus =
  | "pending_payment"
  | "active"
  | "expired"
  | "cancelled";

export interface CustomerPackageInfo {
  id: string;
  status: CustomerPackageStatus;
  sessionsUsed: number;
  sessionsTotal: number;
  expiresAt: string | null;
}

function isCustomerPackageStatus(
  status: string | null | undefined,
): status is CustomerPackageStatus {
  return (
    status === "pending_payment" ||
    status === "active" ||
    status === "expired" ||
    status === "cancelled"
  );
}

/**
 * One purchasable bundle.
 *
 * The customer requests it here, then it can be activated after payment.
 */
export function PackageCard({
  packageInfo,
  initialExisting,
  customerPhone,
  customerName,
}: {
  packageInfo: PackageInfo;
  initialExisting: CustomerPackageInfo | null;
  customerPhone?: string | null;
  customerName?: string | null;
}) {
  const { t, locale } = useLanguage();

  const [existing, setExisting] =
    useState<CustomerPackageInfo | null>(initialExisting);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tamaraLoading, setTamaraLoading] = useState(false);
  const [tamaraError, setTamaraError] = useState<string | null>(
    null,
  );

  const [phoneInput, setPhoneInput] = useState(
    customerPhone ?? "",
  );

  const canRequest =
    !existing ||
    existing.status === "expired" ||
    existing.status === "cancelled";

  const tamaraTotal = tamaraChargeTotal(packageInfo.price);

  const needsPhoneInput = !customerPhone;

  async function request() {
    setLoading(true);
    setError(null);

    const supabase = createClient();

    const { data, error: err } = await supabase.rpc(
      "request_package",
      {
        p_package_id: packageInfo.id,
      },
    );

    setLoading(false);

    if (err || !data) {
      setError(t("package.error"));
      return;
    }

    /*
     * Supabase currently exposes the RPC status as a generic string.
     * Validate it before storing it in our strongly typed UI state.
     */
    if (!isCustomerPackageStatus(data.status)) {
      console.error(
        "Unexpected customer package status returned by request_package:",
        data.status,
      );

      setError(t("package.error"));
      return;
    }

    setExisting({
      id: data.id,
      status: data.status,
      sessionsUsed: data.sessions_used ?? 0,
      sessionsTotal:
        data.sessions_total ?? packageInfo.sessionCount,
      expiresAt: data.expires_at ?? null,
    });
  }

  async function payWithTamara() {
    if (!existing) {
      return;
    }

    const phoneToSend = customerPhone || phoneInput;

    if (!isValidSaudiPhone(phoneToSend)) {
      setTamaraError(t("package.phoneRequired"));
      return;
    }

    setTamaraLoading(true);
    setTamaraError(null);

    try {
      const res = await fetch(
        "/api/payments/tamara/package-checkout",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customerPackageId: existing.id,
            phone: toE164Saudi(phoneToSend),
            ...(customerName
              ? {
                  name: customerName,
                }
              : {}),
          }),
        },
      );

      const data: unknown = await res.json();

      if (
        !res.ok ||
        typeof data !== "object" ||
        data === null ||
        !("checkoutUrl" in data) ||
        typeof data.checkoutUrl !== "string" ||
        !data.checkoutUrl
      ) {
        throw new Error(t("package.tamaraError"));
      }

      window.location.href = data.checkoutUrl;
    } catch {
      setTamaraError(t("package.tamaraError"));
      setTamaraLoading(false);
    }
  }

  return (
    <div className="hairline p-6 md:p-8">
      <span className="tag-number text-ink-600">
        {t("package.title")}
      </span>

      <h3 className="mt-2 font-display text-2xl uppercase text-paper">
        <Localized
          en={packageInfo.nameEn}
          ar={packageInfo.nameAr}
        />
      </h3>

      <p className="mt-2 font-sans text-sm text-ink-400">
        {t("package.description")}
      </p>

      <p className="mt-1 font-sans text-lg font-semibold text-paper">
        {packageInfo.price} SAR
      </p>

      <div className="mt-6">
        {!existing || canRequest ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => void request()}
            className="inline-flex items-center border border-paper px-6 py-3 font-sans text-xs font-semibold tracking-widest text-paper transition-colors duration-300 ease-editorial hover:bg-paper hover:text-ink disabled:opacity-40"
          >
            {loading
              ? t("package.requesting")
              : t("package.request")}
          </button>
        ) : existing.status === "pending_payment" ? (
          <div>
            <p className="font-sans text-sm text-amber-400">
              {t("package.pending")}
            </p>

            <div className="mt-3 flex flex-col items-start gap-3">
              {needsPhoneInput && (
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="05XXXXXXXX"
                  value={phoneInput}
                  onChange={(event) =>
                    setPhoneInput(event.target.value)
                  }
                  className="w-48 border-b border-ink-600 bg-transparent px-2 py-1 font-sans text-sm text-paper placeholder:text-ink-600 focus:border-paper focus:outline-none"
                />
              )}

              <button
                type="button"
                disabled={tamaraLoading}
                onClick={() => void payWithTamara()}
                className="inline-flex items-center border border-paper px-6 py-3 font-sans text-xs font-semibold tracking-widest text-paper transition-colors duration-300 ease-editorial hover:bg-paper hover:text-ink disabled:opacity-40"
              >
                {tamaraLoading
                  ? t("package.payingWithTamara")
                  : t("package.payWithTamara", {
                      amount: tamaraTotal,
                    })}
              </button>

              <span className="font-sans text-xs text-ink-500">
                {t("package.payAtShop")}
              </span>

              {tamaraError && (
                <p className="font-sans text-xs text-red-400">
                  {tamaraError}
                </p>
              )}
            </div>
          </div>
        ) : existing.sessionsUsed >=
          existing.sessionsTotal ? (
          <p className="font-sans text-sm text-ink-400">
            {t("package.usedUp")}
          </p>
        ) : (
          <p className="font-sans text-sm text-status-live">
            {t("package.active", {
              remaining:
                existing.sessionsTotal -
                existing.sessionsUsed,
              total: existing.sessionsTotal,
              date: existing.expiresAt
                ? new Date(
                    existing.expiresAt,
                  ).toLocaleDateString(
                    locale === "ar"
                      ? "ar-SA"
                      : "en-US",
                    {
                      month: "short",
                      day: "numeric",
                    },
                  )
                : "—",
            })}
          </p>
        )}

        {error && (
          <p className="mt-2 font-sans text-xs text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}