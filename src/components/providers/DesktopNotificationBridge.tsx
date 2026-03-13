"use client";

import { useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "@/convex/_generated/api";

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      showNotification: (title: string, body: string) => void;
      onUpdateStatus: (callback: (status: string) => void) => void;
    };
  }
}

export function DesktopNotificationBridge() {
  const data = useQuery(api.notifications.getNotifications, { limit: 5 });
  const shownIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!window.electronAPI || !data) return;

    const { notifications } = data;

    for (const notif of notifications) {
      if (shownIds.current.has(notif._id) || notif.read) continue;

      const age = Date.now() - notif.createdAt;
      if (age < 30_000) {
        window.electronAPI.showNotification(notif.title, notif.message);
      }
      shownIds.current.add(notif._id);
    }

    if (shownIds.current.size > 100) {
      const activeIds = new Set(notifications.map((n) => n._id));
      shownIds.current = activeIds;
    }
  }, [data]);

  return null;
}
