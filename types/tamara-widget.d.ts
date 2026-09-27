// types/tamara-widget.d.ts
// Tamara's official price/installment widget (cdn.tamara.co/widget-v2/tamara-widget.js)
// registers <tamara-widget> as a browser custom element -- TypeScript/JSX has
// no built-in knowledge of it, so this declares it as a valid intrinsic
// element with the attributes Tamara's own embed snippet uses.
import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "tamara-widget": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        type?: string;
        amount?: string;
        "inline-type"?: string;
        config?: string;
      };
    }
  }
}

export {};
