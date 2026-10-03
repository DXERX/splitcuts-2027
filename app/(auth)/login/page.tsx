"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ConcretePanel } from "@/components/ui/ConcretePanel";
import { Button } from "@/components/ui/Button";
import { BrandMark } from "@/components/ui/BrandMark";
import { toE164Saudi } from "@/lib/phone";

type Stage = "enter_email" | "enter_code" | "enter_phone";

/**
 * One flow, not a Phone/Email tab picker -- registration is just "your
 * email" -> "the code we sent" -> (first time only) "your number", then
 * you're in. No password, no separate sign-up screen. Email carries the
 * free OTP code (SMS costs money per message and needs a paid provider);
 * phone is still what we use to identify you for bookings and rewards, so
 * brand-new accounts are asked for it exactly once, right after they verify.
 * Returning customers who already have a number on file skip straight in.
 */
export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("enter_email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendCode() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (error) return setError(error.message);
    setStage("enter_code");
  }

  async function verifyCode() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.auth.verifyOtp({ email, token: otp, type: "email" });
    setLoading(false);
    if (error) return setError(error.message);

    const user = data.user;
    if (!user) {
      router.replace("/");
      router.refresh();
      return;
    }

    // A customer who booked by phone as a guest before ever signing in has
    // appointments with no customer_id attached -- fire-and-forget this on
    // every successful login so those bookings (and any rewards progress
    // tied to them going forward) attach to the account the moment they're
    // actually signed in, not just the first time their phone gets set.
    void supabase.rpc("link_my_guest_bookings");

    const { data: profile } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.phone) {
      setStage("enter_phone");
      return;
    }

    router.replace("/");
    router.refresh();
  }

  async function savePhoneAndFinish() {
    setLoading(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { error } = await supabase
        .from("profiles")
        .update({ phone: toE164Saudi(phone) })
        .eq("id", user.id);
      if (error) {
        setLoading(false);
        setError("That number's already on another account -- try a different one.");
        return;
      }
    }

    setLoading(false);
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen grid-cols-1 bg-ink lg:grid-cols-2">
      {/* Left: photography + brand statement -- hidden on mobile */}
      <div className="relative hidden overflow-hidden lg:block">
        <ConcretePanel className="absolute inset-0 h-full w-full" tone="steel" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/20 to-transparent" />
        <div className="relative z-10 flex h-full flex-col justify-between p-12">
          <Link href="/" className="flex items-center">
            <BrandMark className="h-7 w-auto md:h-8" />
          </Link>
          <div className="max-w-sm">
            <p className="font-display text-3xl uppercase leading-tight text-paper">
              Cut Different.
            </p>
            <p className="mt-3 font-sans text-sm text-ink-200">
              Every chair, one standard. Sign in to manage your bookings and rewards.
            </p>
          </div>
        </div>
      </div>

      {/* Right: auth */}
      <div className="flex flex-col justify-center px-6 py-16 md:px-16 lg:px-20">
        <Link href="/" className="mb-10 flex items-center lg:hidden">
          <BrandMark />
        </Link>

        <h1 className="font-display text-display-md uppercase text-paper">WELCOME BACK.</h1>
        <p className="mt-2 font-sans text-sm text-ink-400">
          Sign in to book, track visits, and unlock rewards.
        </p>

        <div className="mt-10">
          {stage === "enter_email" && (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void sendCode();
              }}
            >
              <div>
                <label className="tag-number text-ink-600">EMAIL</label>
                <input
                  type="email"
                  autoFocus
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="hairline mt-2 w-full bg-transparent px-4 py-3 font-sans text-sm text-paper outline-none placeholder:text-ink-600"
                />
              </div>
              <Button disabled={loading} variant="primary" size="lg">
                {loading ? "SENDING…" : "SEND CODE"}
              </Button>
            </form>
          )}

          {stage === "enter_code" && (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void verifyCode();
              }}
            >
              <p className="font-sans text-sm text-ink-400">Enter the code we emailed to {email}</p>
              <div>
                <label className="tag-number text-ink-600">CODE</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  required
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="hairline mt-2 w-full bg-transparent px-4 py-3 font-sans text-lg tracking-[0.4em] text-paper outline-none placeholder:tracking-normal placeholder:text-ink-600"
                />
              </div>
              <Button disabled={loading} variant="primary" size="lg">
                {loading ? "VERIFYING…" : "VERIFY & CONTINUE"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setStage("enter_email");
                  setOtp("");
                  setError(null);
                }}
                className="font-sans text-xs tracking-widest text-ink-400 hover:text-paper"
              >
                WRONG EMAIL? GO BACK
              </button>
            </form>
          )}

          {stage === "enter_phone" && (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void savePhoneAndFinish();
              }}
            >
              <p className="font-sans text-sm text-ink-400">
                One more thing -- what's your number? We use it to book your chair and track your
                free-cut progress.
              </p>
              <div>
                <label className="tag-number text-ink-600">PHONE</label>
                <div className="hairline mt-2 flex items-center">
                  <span className="border-r border-ink-800 px-4 py-3 font-sans text-sm text-ink-400">
                    +966
                  </span>
                  <input
                    type="tel"
                    autoFocus
                    required
                    placeholder="5X XXX XXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="flex-1 bg-transparent px-4 py-3 font-sans text-sm text-paper outline-none placeholder:text-ink-600"
                  />
                </div>
              </div>
              <Button disabled={loading} variant="primary" size="lg">
                {loading ? "SAVING…" : "FINISH →"}
              </Button>
            </form>
          )}

          {error && <p className="mt-4 font-sans text-sm text-red-400">{error}</p>}
        </div>
      </div>
    </main>
  );
}
