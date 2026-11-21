"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SkeletonCards, SkeletonPageHeader } from "@/components/ui";

/**
 * The way into Recruitment. Founders land on the Overview, which adds
 * everything up; HR and anyone hiring land on Today, which is the work.
 */
export default function RecruitmentHome() {
  const me = useQuery(api.users.getCurrentUser);
  const router = useRouter();
  useEffect(() => {
    if (!me) return;
    router.replace(me.isSuperAdmin === true && me.isHR !== true ? "/recruitment/overview" : "/recruitment/today");
  }, [me, router]);
  return (
    <div className="p-4 sm:p-8">
      <SkeletonPageHeader />
      <SkeletonCards />
    </div>
  );
}
