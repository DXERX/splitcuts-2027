"use client";

// An original, blocky "pixel-sprite" mascot -- built entirely from <rect>
// pixels in our own palette (paper / chrome / ink), not a scan or trace of
// any existing game character. It's meant to read as "an arcade sprite that
// belongs to Split Cuts," the same way a skate brand designs its own
// character rather than licensing one. Idles with a small bob loop and does
// a full-rotation "kickflip" on hover/tap -- a literal game-style
// micro-interaction layered onto the site's existing editorial design.
//
// Respects prefers-reduced-motion for free: globals.css already forces every
// animation/transition duration to ~0 under that media query, and Framer
// Motion transitions are ordinary CSS-driven animations under the hood.

import { motion, useReducedMotion } from "framer-motion";

const PIXEL = 4; // px per grid cell, kept small so the sprite reads as "8-bit"

// 16x16 grid. 0 = empty, 1 = ink outline, 2 = paper (skin/board deck),
// 3 = chrome (board trucks/wheels + accent).
const GRID: number[][] = [
  [0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 2, 1, 1, 2, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 2, 2, 1, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 1, 2, 2, 1, 2, 2, 1, 2, 2, 1, 0, 0, 0, 0],
  [0, 0, 1, 2, 2, 1, 1, 1, 1, 2, 2, 1, 0, 0, 0, 0],
  [0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 1, 2, 0, 0, 0, 0, 2, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 1, 2, 0, 0, 0, 0, 2, 1, 0, 0, 0, 0, 0],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
  [1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0, 0],
  [0, 1, 3, 0, 1, 1, 0, 0, 1, 1, 0, 3, 1, 0, 0, 0],
  [0, 1, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0],
  [0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0],
];

const COLORS: Record<number, string> = {
  1: "#17130F", // ink-950
  2: "#F3EEE3", // paper
  3: "#C9A227", // chrome
};

export function SkaterSprite({ className }: { className?: string }) {
  const size = GRID[0]!.length * PIXEL;
  // Framer Motion animates via the Web Animations API, not CSS
  // animation/transition properties -- globals.css's prefers-reduced-motion
  // override can't reach it, so it's gated here explicitly instead.
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      style={{ width: size, height: size }}
      animate={reduceMotion ? undefined : { y: [0, -6, 0] }}
      transition={reduceMotion ? undefined : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      whileHover={reduceMotion ? undefined : { rotate: 360, transition: { duration: 0.6, ease: "easeInOut" } }}
      whileTap={reduceMotion ? undefined : { rotate: 360, transition: { duration: 0.6, ease: "easeInOut" } }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        shapeRendering="crispEdges"
        role="img"
        aria-label="Split Cuts skater sprite"
      >
        {GRID.flatMap((row, y) =>
          row.map((cell, x) =>
            cell === 0 ? null : (
              <rect
                key={`${x}-${y}`}
                x={x * PIXEL}
                y={y * PIXEL}
                width={PIXEL}
                height={PIXEL}
                fill={COLORS[cell]}
              />
            ),
          ),
        )}
      </svg>
    </motion.div>
  );
}
