import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    screens: {
      xs: "420px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1440px",
      "3xl": "1600px",
    },
    extend: {
      // Warm concrete/stone palette (not neutral gray-black) -- every "ink"
      // shade carries a slight warm/brown undertone instead of pure
      // desaturated gray, and "chrome" shifted from cool steel to a warm
      // brass/gold so the premium accents (Tamara badge, reward "FREE" text,
      // the chrome Button variant) read warm too. Same shade *structure* as
      // before (DEFAULT darkest -> 200 lightest), so every existing
      // bg-ink-800 / text-ink-200 / border-ink-800 class across the app just
      // repaints -- nothing else needed to change.
      colors: {
        ink: {
          // Warm concrete/stone, not cool slate -- Ahmed's explicit call
          // ("خرساني دافئ، مو أسود نقي"): keep the dark editorial base, warm
          // every shade instead of a cool blue-gray. Restored here after a
          // later pass reverted it back to cool tones; don't re-cool these.
          DEFAULT: "#0F0D0B",
          950: "#17130F",
          900: "#241E17",
          800: "#362D24",
          600: "#55483A",
          400: "#8A7864",
          300: "#AC9D89",
          200: "#C9BEB0",
        },
        paper: {
          DEFAULT: "#F3EEE3",
          white: "#FFFFFF",
        },
        chrome: {
          DEFAULT: "#C9A227",
          light: "#EAD37E",
          dark: "#8C6D1A",
        },
        status: {
          live: "#3FAE58",
          hold: "#D98C2B",
          off: "#8A7864",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        sans: ["var(--font-interface)", "sans-serif"],
      },
      fontSize: {
        "display-xl": ["clamp(3.5rem, 9vw, 8.5rem)", { lineHeight: "0.92", letterSpacing: "-0.01em" }],
        "display-lg": ["clamp(2.75rem, 6vw, 5.5rem)", { lineHeight: "0.94", letterSpacing: "-0.01em" }],
        "display-md": ["clamp(2rem, 4vw, 3.25rem)", { lineHeight: "0.98" }],
        "display-sm": ["clamp(1.5rem, 2.4vw, 2rem)", { lineHeight: "1.02" }],
      },
      borderRadius: {
        none: "0px",
        xs: "4px",
        sm: "6px",
        DEFAULT: "6px",
        md: "8px",
      },
      spacing: {
        18: "4.5rem",
        22: "5.5rem",
        30: "7.5rem",
      },
      maxWidth: {
        content: "1600px",
        prose: "1440px",
      },
      letterSpacing: {
        tightest: "-0.02em",
        wide: "0.08em",
        widest: "0.18em",
      },
      transitionTimingFunction: {
        editorial: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      transitionDuration: {
        400: "400ms",
        600: "600ms",
        800: "800ms",
      },
      backgroundImage: {
        grain: "url('data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'160\\' height=\\'160\\'><filter id=\\'n\\'><feTurbulence type=\\'fractalNoise\\' baseFrequency=\\'0.9\\' numOctaves=\\'2\\' stitchTiles=\\'stitch\\'/><feColorMatrix type=\\'saturate\\' values=\\'0\\'/></filter><rect width=\\'100%25\\' height=\\'100%25\\' filter=\\'url(%23n)\\' opacity=\\'0.4\\'/></svg>')",
      },
    },
  },
  plugins: [],
};

export default config;
