"use client";
// components/ui/TamaraInstallmentWidget.tsx
// Tamara's official "pay in installments" price widget -- shows the real
// per-instalment breakdown for a given amount, using Tamara's own hosted
// script rather than us re-deriving the math ourselves. See
// https://docs.tamara.co/docs/shopify-widgets for the source embed pattern
// (window.tamaraWidgetConfig + <tamara-widget>) this mirrors.
//
// Needs NEXT_PUBLIC_TAMARA_PUBLIC_KEY set (safe to expose client-side --
// it's the publishable widget key, not the server-only API bearer token in
// TAMARA_API_TOKEN). Renders nothing if that key isn't configured yet.
import { useEffect } from "react";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_TAMARA_PUBLIC_KEY;
const SCRIPT_SRC = "https://cdn.tamara.co/widget-v2/tamara-widget.js";

declare global {
  interface Window {
    tamaraWidgetConfig?: {
      lang: string;
      country: string;
      publicKey: string | undefined;
    };
  }
}

let scriptRequested = false;

function ensureTamaraWidgetScript() {
  if (scriptRequested || typeof document === "undefined") return;
  scriptRequested = true;

  window.tamaraWidgetConfig = { lang: "en", country: "SA", publicKey: PUBLIC_KEY };

  const script = document.createElement("script");
  script.src = SCRIPT_SRC;
  script.async = true;
  document.body.appendChild(script);
}

export function TamaraInstallmentWidget({
  amount,
  className = "",
}: {
  /** SAR amount to split -- pass the same total the checkout button charges. */
  amount: number;
  className?: string;
}) {
  useEffect(() => {
    ensureTamaraWidgetScript();
  }, []);

  if (!PUBLIC_KEY || !(amount > 0)) return null;

  return (
    <tamara-widget
      type="tamara-summary"
      amount={amount.toFixed(2)}
      inline-type="2"
      className={className}
    />
  );
}
