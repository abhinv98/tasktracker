"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function PortalIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/portal/jsr");
  }, [router]);
  return null;
}
