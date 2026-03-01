"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { useQuery } from "convex/react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Button, Input } from "@/components/ui";

function SignUpForm() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inviteToken = searchParams.get("invite");
  const invite = useQuery(
    api.users.getInviteByToken,
    inviteToken ? { token: inviteToken } : "skip"
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("flow", "signUp");

    // When signing up via invite, enforce the invite email
    if (invite?.email) {
      formData.set("email", invite.email);
    }
    if (invite?.name) {
      formData.set("name", invite.name);
    }

    try {
      await signIn("password", formData);
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
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
          The Ecultify
        </span>
      </div>

      {invite && (
        <div className="mb-4 rounded-lg bg-[var(--accent-admin)]/8 border border-[var(--accent-admin)]/20 px-4 py-3">
          <p className="text-[13px] font-medium text-[var(--accent-admin)]">
            You&apos;ve been invited to join as{" "}
            <span className="capitalize">{invite.role}</span>
          </p>
        </div>
      )}

      <p className="text-[14px] text-[var(--text-secondary)] mb-6">
        {invite ? "Complete your account setup" : "Create your account"}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Name"
          name="name"
          type="text"
          placeholder="Your name"
          required
          {...(invite?.name
            ? { value: invite.name, readOnly: true, className: "bg-[var(--bg-secondary)] cursor-not-allowed" }
            : {}
          )}
        />
        <Input
          label="Email"
          name="email"
          type="email"
          placeholder="you@example.com"
          required
          {...(invite?.email
            ? { value: invite.email, readOnly: true, className: "bg-[var(--bg-secondary)] cursor-not-allowed" }
            : {}
          )}
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
              placeholder="Min 8 characters"
              required
              minLength={8}
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
        <input name="flow" type="hidden" value="signUp" />

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
              Signing up
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            </>
          ) : (
            "Sign Up"
          )}
        </Button>

        <a
          href="/sign-in"
          className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-center transition-colors"
        >
          Already have an account? Sign in
        </a>
      </form>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={
      <div className="bg-white rounded-xl border border-[var(--border)] shadow-sm p-8">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-admin)] flex items-center justify-center">
            <span className="text-white font-bold text-[13px]">O</span>
          </div>
          <span className="font-semibold text-[16px] text-[var(--text-primary)]">
            The Ecultify
          </span>
        </div>
        <p className="text-[14px] text-[var(--text-secondary)]">Loading...</p>
      </div>
    }>
      <SignUpForm />
    </Suspense>
  );
}
