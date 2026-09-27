"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { SkaterSprite } from "@/components/ui/SkaterSprite";
import { EASE } from "@/lib/motion";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export function Hero() {
  const { t } = useLanguage();
  return (
    <section className="relative flex h-[100svh] min-h-[640px] w-full items-end overflow-hidden bg-ink">
      <motion.div
        initial={{ opacity: 0, scale: 1.04 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.4, ease: EASE }}
        className="absolute inset-0"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static local asset, no next/image loader needed */}
        <img
          src="/photos/storefront-night.jpg"
          alt="Split Cuts storefront at night, Abhur, Jeddah"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-ink/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/50 to-ink/10" />
      </motion.div>

      <div className="relative z-10 flex w-full flex-col gap-10 px-6 pb-14 md:px-10 md:pb-20">
        <div className="flex items-center justify-between">
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6, ease: EASE }}
            className="eyebrow text-ink-200"
          >
            {t("hero.eyebrow")}
          </motion.span>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.6, ease: EASE }}
            className="eyebrow flex flex-col items-end gap-1 text-right text-ink-200"
          >
            <span>{t("hero.location")}</span>
            <span className="text-ink-400">{t("hero.hours")}</span>
          </motion.span>
        </div>

        <div>
          <div className="overflow-hidden">
            <motion.h1
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              transition={{ delay: 0.7, duration: 0.9, ease: EASE }}
              className="font-display text-display-xl uppercase text-paper"
            >
              {t("hero.headline")}
            </motion.h1>
          </div>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.15, duration: 0.6, ease: EASE }}
            className="mt-4 max-w-md font-sans text-lg text-ink-200"
          >
            {t("hero.subtext1")}
            <br />
            {t("hero.subtext2")}
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.35, duration: 0.6, ease: EASE }}
          className="flex flex-wrap items-center gap-4"
        >
          <Link
            href="#services"
            className="pixel-corners inline-flex items-center bg-paper px-8 py-4 font-sans text-sm font-semibold tracking-widest text-ink transition-colors duration-400 ease-editorial hover:bg-white"
          >
            {t("hero.cta")}
          </Link>
          <SkaterSprite className="cursor-pointer" />
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6, duration: 0.6 }}
        className="absolute bottom-6 right-6 hidden flex-col items-center gap-2 md:flex"
      >
        <motion.span
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          className="h-10 w-px bg-ink-200/50"
        />
        <span className="font-sans text-[10px] font-semibold tracking-widest text-ink-200/70">
          {t("hero.scroll")}
        </span>
      </motion.div>
    </section>
  );
}
