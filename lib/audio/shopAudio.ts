// lib/audio/shopAudio.ts
"use client";

/**
 * Shop Mode audio.
 *
 * No external MP3 file is required.
 * The notification chime is generated directly with Web Audio API.
 *
 * Browsers require a user gesture before audio / speech can play,
 * so staff must enable Shop Audio once from the UI.
 */

class ShopAudio {
  private enabled = false;
  private volume = 0.8;
  private audioContext: AudioContext | null = null;

  get isEnabled() {
    return this.enabled;
  }

  private getAudioContext() {
    if (typeof window === "undefined") {
      return null;
    }

    if (!this.audioContext) {
      const AudioContextClass =
        window.AudioContext ??
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;

      if (!AudioContextClass) {
        return null;
      }

      this.audioContext = new AudioContextClass();
    }

    return this.audioContext;
  }

  /**
   * Must be called from a user click/tap handler.
   */
  async enable(volume = 0.8) {
    this.volume = Math.min(
      Math.max(volume, 0),
      1,
    );

    const context = this.getAudioContext();

    if (context?.state === "suspended") {
      try {
        await context.resume();
      } catch {
        // Browser may still block audio until another
        // explicit interaction.
      }
    }

    /*
     * Prime speech synthesis from the same user gesture.
     */
    if (
      typeof window !== "undefined" &&
      "speechSynthesis" in window
    ) {
      try {
        const primer =
          new SpeechSynthesisUtterance(" ");

        primer.volume = 0;

        window.speechSynthesis.speak(primer);
      } catch {
        // Speech synthesis is optional.
      }
    }

    this.enabled = true;

    try {
      localStorage.setItem(
        "shopAudioEnabled",
        "1",
      );
    } catch {
      // Per-device convenience only.
    }
  }

  disable() {
    this.enabled = false;

    if (
      typeof window !== "undefined" &&
      "speechSynthesis" in window
    ) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore optional speech errors.
      }
    }

    try {
      localStorage.setItem(
        "shopAudioEnabled",
        "0",
      );
    } catch {
      // Ignore storage failures.
    }
  }

  /**
   * Generate a clean two-tone notification chime.
   *
   * No network request.
   * No /public/sounds file.
   * No MP3 404.
   */
  playChime() {
    if (!this.enabled) {
      return;
    }

    const context = this.getAudioContext();

    if (!context) {
      return;
    }

    if (context.state === "suspended") {
      void context.resume().catch(() => {});
    }

    const now = context.currentTime;

    const playTone = (
      frequency: number,
      startOffset: number,
      duration: number,
      gainValue: number,
    ) => {
      const oscillator =
        context.createOscillator();

      const gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(
        frequency,
        now + startOffset,
      );

      gain.gain.setValueAtTime(
        0.0001,
        now + startOffset,
      );

      gain.gain.exponentialRampToValueAtTime(
        Math.max(
          0.0001,
          gainValue * this.volume,
        ),
        now + startOffset + 0.015,
      );

      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + startOffset + duration,
      );

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.start(
        now + startOffset,
      );

      oscillator.stop(
        now + startOffset + duration + 0.03,
      );
    };

    /*
     * Short premium-style double chime.
     */
    playTone(
      659.25,
      0,
      0.16,
      0.32,
    );

    playTone(
      987.77,
      0.12,
      0.24,
      0.28,
    );
  }

  /**
   * Example:
   *
   * announce("Sam", "6:30 PM")
   *
   * -> "Sam, you have a new booking at 6:30 PM."
   */
  announce(
    barberFirstName: string,
    timeLabel: string,
  ) {
    if (
      !this.enabled ||
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    ) {
      return;
    }

    try {
      const utterance =
        new SpeechSynthesisUtterance(
          `${barberFirstName}, you have a new booking at ${timeLabel}.`,
        );

      utterance.volume = this.volume;
      utterance.rate = 1;

      window.speechSynthesis.speak(
        utterance,
      );
    } catch {
      // Voice announcement is optional.
    }
  }

  testSound(
    barberFirstName = "Sam",
    timeLabel = "6:30 PM",
  ) {
    this.playChime();

    this.announce(
      barberFirstName,
      timeLabel,
    );
  }
}

export const shopAudio = new ShopAudio();