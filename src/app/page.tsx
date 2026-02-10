"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";

export default function HomePage() {
  const user = useQuery(api.users.getCurrentUser);
  const router = useRouter();

  useEffect(() => {
    if (user === null) {
      router.replace("/sign-in");
    } else if (user) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <p className="text-[14px] text-[var(--text-secondary)]">
          Loading...
        </p>
      </div>
    );
  }

  if (user === null) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <p className="text-[14px] text-[var(--text-secondary)]">
        Redirecting...
      </p>
    </div>
  );
}
