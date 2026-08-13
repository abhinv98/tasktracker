"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { type ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { CelebrateProvider } from "@/components/ui/Celebrate";
import { DesktopNotificationBridge } from "./DesktopNotificationBridge";

const convex = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ?? "https://affable-guanaco-287.convex.cloud"
);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthProvider client={convex}>
      <DesktopNotificationBridge />
      <ToastProvider>
        <CelebrateProvider>{children}</CelebrateProvider>
      </ToastProvider>
    </ConvexAuthProvider>
  );
}
