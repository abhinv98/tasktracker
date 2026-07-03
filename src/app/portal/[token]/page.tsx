"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvex, useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Eye, EyeOff, Inbox, Loader2, LogIn } from "lucide-react";

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
  const { signIn, signOut } = useAuthActions();

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

  // Already signed in as a client → straight to the dashboard;
  // internal users keep their session and go to the internal dashboard.
  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role === "client") {
      router.replace("/portal");
    }
  }, [currentUser, router]);

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
        router.push("/portal");
      } else if (user) {
        // Internal account logged in through the portal link — send them home.
        router.push("/dashboard");
      }
    } catch {
      setError("Invalid email or password. Please contact your account manager if you need access.");
      setIsSubmitting(false);
    }
  }

  if (info === undefined) {
    return (
      <div className="min-h-screen bg-[#f8f8f8] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-[3px] border-[#e5e5e5] border-t-[#171717] rounded-full animate-spin" />
          <p className="text-[13px] text-[#a3a3a3] font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (info === null || !info.isActive) {
    return (
      <div className="min-h-screen bg-[#f8f8f8] flex items-center justify-center">
        <div className="text-center max-w-sm mx-auto p-8">
          <div className="w-16 h-16 rounded-2xl bg-[#fef2f2] flex items-center justify-center mx-auto mb-4">
            <Inbox className="h-8 w-8 text-[#ef4444]" />
          </div>
          <h1 className="text-[20px] font-semibold text-[#171717] mb-2">Portal Unavailable</h1>
          <p className="text-[14px] text-[#737373] leading-relaxed">
            This client portal link is no longer active. Please contact your account manager for an updated link.
          </p>
        </div>
      </div>
    );
  }

  const bc = info.brandColor;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#f8f8f8" }}>
      <div
        className="h-40"
        style={{ background: `linear-gradient(135deg, ${bc}, ${bc}dd)` }}
      />
      <div className="flex-1 flex items-start justify-center px-6">
        <div className="w-full max-w-md -mt-20">
          <div className="bg-white rounded-2xl border border-[#e5e5e5] shadow-sm p-8">
            <div className="flex items-center gap-4 mb-6">
              {info.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={info.logoUrl}
                  alt={info.brandName}
                  className="w-14 h-14 rounded-2xl object-cover border border-[#e5e5e5]"
                />
              ) : (
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: bc + "15" }}
                >
                  <span className="font-bold text-[22px]" style={{ color: bc }}>
                    {info.brandName[0]}
                  </span>
                </div>
              )}
              <div>
                <h1 className="font-bold text-[20px] text-[#171717] tracking-tight">{info.brandName}</h1>
                <p className="text-[13px] text-[#737373]">Client Portal</p>
              </div>
            </div>

            <p className="text-[13px] text-[#737373] mb-5">
              Sign in with the account your Ecultify team created for you.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-[#525252] mb-1.5">Email</label>
                <input
                  name="email"
                  type="email"
                  placeholder="you@company.com"
                  required
                  className="w-full px-3 py-2.5 rounded-xl border border-[#e5e5e5] text-[14px] text-[#171717] placeholder-[#c4c4c4] focus:outline-none focus:ring-2 focus:border-transparent bg-white"
                  style={{ "--tw-ring-color": bc + "40" } as React.CSSProperties}
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#525252] mb-1.5">Password</label>
                <div className="relative">
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Your password"
                    required
                    className="w-full px-3 py-2.5 pr-10 rounded-xl border border-[#e5e5e5] text-[14px] text-[#171717] placeholder-[#c4c4c4] focus:outline-none focus:ring-2 focus:border-transparent bg-white"
                    style={{ "--tw-ring-color": bc + "40" } as React.CSSProperties}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#a3a3a3] hover:text-[#171717] transition-colors p-1 rounded"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <input name="flow" type="hidden" value="signIn" />

              {error && <p className="text-[13px] text-red-500 font-medium">{error}</p>}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-[14px] font-semibold transition-all disabled:opacity-60"
                style={{ backgroundColor: bc }}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                {isSubmitting ? "Signing in…" : "Sign In"}
              </button>

              <p className="text-[12px] text-[#a3a3a3] text-center">
                No account? Contact your account manager to get access.
              </p>
            </form>
          </div>

          <footer className="text-center pt-6 pb-8">
            <p className="text-[11px] text-[#d4d4d4]">Powered by Ecultify</p>
          </footer>
        </div>
      </div>
    </div>
  );
}
