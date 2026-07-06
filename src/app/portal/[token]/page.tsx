"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvex, useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Eye, EyeOff, Inbox } from "lucide-react";
import { PortalButton } from "@/components/portal/ui";
import "../portal-theme.css";

/**
 * Public branded login for a brand's client portal. The token is the
 * shareable link; only client accounts created for this brand can enter.
 */
export default function PortalLoginPage() {
  const params = useParams();
  const router = useRouter();
  const convex = useConvex();
  const token = params.token as string;
  const info = useQuery(api.clientPortal.getPortalPublicInfo, { token });
  const currentUser = useQuery(api.users.getCurrentUser);
  const { signIn } = useAuthActions();

  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Remember the portal link so /portal can bounce logged-out users back here.
  useEffect(() => {
    if (info?.isActive) {
      try {
        localStorage.setItem("portalToken", token);
      } catch {}
    }
  }, [info, token]);

  // Already signed in as a client → straight to the dashboard (the layout
  // canonicalizes to their own brand slug if this token isn't theirs);
  // internal users keep their session and go to the internal dashboard.
  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role === "client") {
      router.replace(`/portal/${token}/jsr`);
    }
  }, [currentUser, router, token]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);

    try {
      await signIn("password", formData);
      const user = await convex.query(api.users.getCurrentUser, {});
      if (user?.role === "client") {
        // "login" activity is recorded by the portal layout once the session loads
        router.push(`/portal/${token}/jsr`);
      } else if (user) {
        // Internal account logged in through the portal link — send them home.
        router.push("/dashboard");
      }
    } catch {
      setError("Invalid email or password. Contact your account manager if you need access.");
      setIsSubmitting(false);
    }
  }

  if (info === undefined) {
    return (
      <div className="portal-root min-h-screen flex items-center justify-center">
        <div className="w-full max-w-md px-6 space-y-3">
          <div className="p-shimmer h-14 w-14 rounded-[var(--p-radius-md)] mx-auto" />
          <div className="p-shimmer h-4 w-40 mx-auto" />
          <div className="p-shimmer h-9 w-full" />
          <div className="p-shimmer h-9 w-full" />
        </div>
      </div>
    );
  }

  if (info === null || !info.isActive) {
    return (
      <div className="portal-root min-h-screen flex items-center justify-center">
        <div className="text-center max-w-sm mx-auto p-8">
          <div className="w-14 h-14 rounded-[var(--p-radius-md)] bg-[var(--p-danger-soft)] flex items-center justify-center mx-auto mb-4">
            <Inbox className="h-7 w-7 text-[var(--p-danger)]" />
          </div>
          <h1 className="p-title mb-2">Portal unavailable</h1>
          <p className="p-body text-[var(--p-text-2)]">
            This client portal link is no longer active. Contact your account manager for an
            updated link.
          </p>
        </div>
      </div>
    );
  }

  const bc = info.brandColor;

  return (
    <div
      className="portal-root min-h-screen flex flex-col items-center justify-center px-6 py-10"
      style={{ "--p-brand": bc } as React.CSSProperties}
    >
      <div className="w-full max-w-md">
        <div
          className="bg-[var(--p-surface)] rounded-[var(--p-radius-lg)] border border-[var(--p-border)] p-8"
          style={{ boxShadow: "var(--p-shadow)" }}
        >
          <div className="flex items-center gap-4 mb-6">
            {info.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={info.logoUrl}
                alt={info.brandName}
                className="w-12 h-12 rounded-[var(--p-radius-md)] object-cover border border-[var(--p-border)]"
              />
            ) : (
              <div
                className="w-12 h-12 rounded-[var(--p-radius-md)] flex items-center justify-center"
                style={{ backgroundColor: "var(--p-brand-soft)" }}
              >
                <span className="font-bold text-[20px]" style={{ color: bc }}>
                  {info.brandName[0]}
                </span>
              </div>
            )}
            <div>
              <h1 className="p-title">{info.brandName}</h1>
              <p className="p-overline mt-0.5">Client portal</p>
            </div>
          </div>

          <p className="p-secondary mb-5">
            Sign in with the account your Ecultify team created for you.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="p-overline block mb-1.5">Email</label>
              <input name="email" type="email" placeholder="you@company.com" required className="p-input" />
            </div>
            <div>
              <label className="p-overline block mb-1.5">Password</label>
              <div className="relative">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Your password"
                  required
                  className="p-input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--p-text-3)] hover:text-[var(--p-text)] p-1 rounded-[var(--p-radius-sm)]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <input name="flow" type="hidden" value="signIn" />

            {error && <p className="text-[12.5px] font-medium text-[var(--p-danger)]">{error}</p>}

            <PortalButton type="submit" loading={isSubmitting} className="w-full">
              Sign in
            </PortalButton>

            <p className="p-secondary text-[var(--p-text-3)] text-center">
              Forgot your password or need an account? Ask your account manager to reset or
              create one for you.
            </p>
          </form>
        </div>

        <footer className="text-center pt-6">
          <p className="text-[11px] text-[var(--p-text-3)]">Powered by Ecultify</p>
        </footer>
      </div>
    </div>
  );
}
