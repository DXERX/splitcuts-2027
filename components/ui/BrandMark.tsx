import clsx from "clsx";

/**
 * The real Split Cuts logo (as used on the live site), not a typography
 * stand-in. "full" is the wordmark + hexagon lockup; "mark" is the hexagon
 * icon alone. Both PNGs are solid white on transparent, so they only work
 * on the dark surfaces this product uses everywhere.
 */
export function BrandMark({
  variant = "full",
  className,
}: {
  variant?: "full" | "mark";
  className?: string;
}) {
  const src = variant === "full" ? "/brand/logo-full.png" : "/brand/logo-mark.png";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static local asset, no next/image loader needed
    <img
      src={src}
      alt="Split Cuts"
      className={clsx(variant === "full" ? "h-6 w-auto md:h-7" : "h-7 w-auto", className)}
    />
  );
}
