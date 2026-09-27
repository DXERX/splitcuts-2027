"use client";

import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import { motion } from "framer-motion";

type Variant = "primary" | "secondary" | "ghost" | "chrome";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-sans font-semibold uppercase tracking-wide transition-colors duration-400 ease-editorial disabled:opacity-40 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary: "bg-paper text-ink hover:bg-white",
  secondary: "bg-transparent text-paper border border-paper hover:bg-paper hover:text-ink",
  ghost: "bg-transparent text-paper hover:text-ink-200",
  chrome:
    "bg-gradient-to-b from-chrome-light via-chrome to-chrome-dark text-ink hover:brightness-110",
};

const sizes: Record<Size, string> = {
  md: "px-6 py-3 text-sm rounded-xs",
  lg: "px-8 py-4 text-sm rounded-xs",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onAnimationStart" | "onAnimationEnd" | "onDragStart" | "onDragEnd" | "onDrag"
>;

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: CommonProps & NativeButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      className={clsx(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </motion.button>
  );
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: CommonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <Link href={href} className={clsx(base, variants[variant], sizes[size], className)} {...props}>
      {children}
    </Link>
  );
}
