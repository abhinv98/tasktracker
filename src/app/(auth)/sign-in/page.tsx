"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button, Input } from "@/components/ui";

export default function SignInPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [step, setStep] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  const [showForgot, setShowForgot] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      await signIn("password", formData);
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[var(--border)] shadow-sm p-8">
      <div className="flex items-center gap-2.5 mb-6">
        <div className="w-8 h-8 rounded-lg bg-[var(--accent-admin)] flex items-center justify-center">
          <span className="text-white font-bold text-[13px]">O</span>
        </div>
        <span className="font-semibold text-[16px] text-[var(--text-primary)]">
          The Orchestrator
        </span>
      </div>

      <p className="text-[14px] text-[var(--text-secondary)] mb-6">
        {step === "signIn"
          ? "Sign in to your account"
          : "Create your account"}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {step === "signUp" && (
          <Input
            label="Name"
            name="name"
            type="text"
            placeholder="Your name"
            required
          />
        )}
        <Input
          label="Email"
          name="email"
          type="email"
          placeholder="you@example.com"
          required
        />
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="password"
            className="font-medium text-[13px] text-[var(--text-secondary)]"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder={step === "signUp" ? "Min 8 characters" : "Your password"}
              required
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-[14px] px-3 py-2 pr-10 placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] focus:ring-offset-1 focus:ring-offset-white transition-all duration-150"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1.5 rounded flex items-center justify-center"
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>
        <input name="flow" type="hidden" value={step} />

        {error && (
          <p className="text-[13px] text-[var(--danger)]">
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          className="w-full flex items-center justify-center gap-2"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              {step === "signIn" ? "Signing in" : "Signing up"}
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            </>
          ) : (
            step === "signIn" ? "Sign In" : "Sign Up"
          )}
        </Button>

        {step === "signIn" && (
          <button
            type="button"
            onClick={() => setShowForgot(!showForgot)}
            className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Forgot your password?
          </button>
        )}

        {showForgot && (
          <p className="text-[12px] text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded-lg px-3 py-2">
            Please contact your administrator to reset your password.
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            setStep(step === "signIn" ? "signUp" : "signIn");
            setShowForgot(false);
          }}
          className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          {step === "signIn" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
