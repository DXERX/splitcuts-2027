// components/ui/TamaraBadge.tsx
// A small "tamara" wordmark badge in the brand's own signature purple, used
// wherever the site needs to signal the Tamara payment option is available.
// Built as plain CSS/text rather than a downloaded logo file, so it stays
// crisp at any size and needs no external image request.
export function TamaraBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-[#9601F1] px-3 py-1 font-sans text-sm font-semibold lowercase tracking-tight text-white ${className}`}
    >
      tamara
    </span>
  );
}
