// lib/motion.ts
// Shared Framer Motion variants -- controlled, editorial movement. No bounce,
// no overshoot, no flashy entrances. Everything eases with the same curve
// (theme "editorial" cubic-bezier) so the whole product moves consistently.

export const EASE = [0.16, 1, 0.3, 1] as const;

export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

export const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.8, ease: EASE } },
};

export const maskReveal = {
  hidden: { clipPath: "inset(0 0 100% 0)" },
  show: { clipPath: "inset(0 0 0% 0)", transition: { duration: 0.9, ease: EASE } },
};

export const staggerChildren = (stagger = 0.08, delayChildren = 0) => ({
  hidden: {},
  show: {
    transition: { staggerChildren: stagger, delayChildren },
  },
});

export const slideUpCTA = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE, delay: 0.4 } },
};

export const scaleTap = { scale: 0.97 };
