// lib/audio/shopAudio.ts
// Shop Mode audio: browsers block autoplay audio and speech synthesis until
// a user gesture unlocks the AudioContext, so Shop Mode requires an explicit
// "Enable Shop Audio" button (see app/(staff)/cashier/page.tsx) that calls
// `shopAudio.enable()` from within a click handler.
"use client";

class ShopAudio {
  private enabled = false;
  private volume = 0.8;
  private chime: HTMLAudioElement | null = null;

  get isEnabled() {
    return this.enabled;
  }

  /** Must be called synchronously from within a user click/tap handler. */
  async enable(volume = 0.8) {
    this.volume = volume;
    this.chime = new Audio("/sounds/new-booking-chime.mp3");
    this.chime.volume = volume;

    // Unlock the Web Audio / SpeechSynthesis engines with a near-silent
    // primer, per each API's autoplay-policy requirements.
    try {
      await this.chime.play();
      this.chime.pause();
      this.chime.currentTime = 0;
    } catch {
      // Some browsers still refuse until a real interaction; the explicit
      // "Test sound" button gives the user a second chance to unlock it.
    }

    if ("speechSynthesis" in window) {
      const primer = new SpeechSynthesisUtterance(" ");
      primer.volume = 0;
      window.speechSynthesis.speak(primer);
    }

    this.enabled = true;
    try {
      localStorage.setItem("shopAudioEnabled", "1");
    } catch {
      // ignore — per-viewer convenience only
    }
  }

  disable() {
    this.enabled = false;
    try {
      localStorage.setItem("shopAudioEnabled", "0");
    } catch {
      // ignore
    }
  }

  playChime() {
    if (!this.enabled || !this.chime) return;
    this.chime.currentTime = 0;
    void this.chime.play().catch(() => {});
  }

  /** e.g. announce("Sam", "6:30 PM") -> "Sam, you have a new booking at six thirty PM." */
  announce(barberFirstName: string, timeLabel: string) {
    if (!this.enabled || !("speechSynthesis" in window)) return;

    const utterance = new SpeechSynthesisUtterance(
      `${barberFirstName}, you have a new booking at ${timeLabel}.`,
    );
    utterance.volume = this.volume;
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }

  testSound(barberFirstName = "Sam", timeLabel = "6:30 PM") {
    this.playChime();
    this.announce(barberFirstName, timeLabel);
  }
}

export const shopAudio = new ShopAudio();
