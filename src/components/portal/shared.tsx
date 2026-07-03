"use client";

import { CheckCircle2, Circle, Clock, Loader2 } from "lucide-react";

export const TASK_STATUS: Record<
  string,
  { label: string; color: string; icon: "pending" | "progress" | "review" | "done" }
> = {
  pending: { label: "Pending", color: "#a3a3a3", icon: "pending" },
  "in-progress": { label: "In Progress", color: "#f59e0b", icon: "progress" },
  review: { label: "In Review", color: "#8b5cf6", icon: "review" },
  done: { label: "Completed", color: "#10b981", icon: "done" },
};

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatPostDate(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return formatDate(ts);
}

export function daysUntil(ts: number): { text: string; urgent: boolean; overdue: boolean } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(ts);
  deadline.setHours(0, 0, 0, 0);
  const days = Math.round((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, urgent: true, overdue: true };
  if (days === 0) return { text: "Due today", urgent: true, overdue: false };
  if (days === 1) return { text: "Due tomorrow", urgent: true, overdue: false };
  if (days <= 3) return { text: `${days} days left`, urgent: true, overdue: false };
  if (days <= 7) return { text: `${days} days left`, urgent: false, overdue: false };
  return { text: `${days} days left`, urgent: false, overdue: false };
}

export function monthLabel(m: string) {
  if (!m || m === "unscheduled") return "Unscheduled";
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function StatusIcon({ status, brandColor }: { status: string; brandColor: string }) {
  const info = TASK_STATUS[status];
  if (!info) return null;
  const color = status === "in-progress" ? brandColor : info.color;
  if (info.icon === "done") return <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color }} />;
  if (info.icon === "progress") return <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color }} />;
  if (info.icon === "review") return <Clock className="h-4 w-4 shrink-0" style={{ color }} />;
  return <Circle className="h-3.5 w-3.5 shrink-0" style={{ color }} />;
}

/** Month filter chips — the shared "segregate by month" control. */
export function MonthChips({
  months,
  selected,
  onSelect,
  brandColor,
}: {
  months: string[];
  selected: string;
  onSelect: (m: string) => void;
  brandColor: string;
}) {
  if (months.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        onClick={() => onSelect("")}
        className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
          selected === "" ? "text-white border-transparent" : "text-[#525252] border-[#e5e5e5] bg-white hover:border-[#c4c4c4]"
        }`}
        style={selected === "" ? { backgroundColor: brandColor } : {}}
      >
        All months
      </button>
      {months.map((m) => (
        <button
          key={m}
          onClick={() => onSelect(m)}
          className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
            selected === m ? "text-white border-transparent" : "text-[#525252] border-[#e5e5e5] bg-white hover:border-[#c4c4c4]"
          }`}
          style={selected === m ? { backgroundColor: brandColor } : {}}
        >
          {monthLabel(m)}
        </button>
      ))}
    </div>
  );
}

/** Section card shell used across portal tabs. */
export function PortalCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white rounded-xl border border-[#e5e5e5] overflow-hidden shadow-sm ${className}`}>
      {children}
    </section>
  );
}

export function PortalCardHeader({
  icon,
  title,
  count,
  brandColor,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  brandColor: string;
}) {
  return (
    <div className="flex items-center gap-2.5 px-6 py-4 border-b border-[#f0f0f0]">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: brandColor + "12", color: brandColor }}
      >
        {icon}
      </div>
      <h2 className="font-semibold text-[15px] text-[#171717]">{title}</h2>
      {count !== undefined && <span className="text-[12px] text-[#a3a3a3] ml-1">{count}</span>}
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="px-6 py-12 text-center">
      <div className="w-12 h-12 rounded-xl bg-[#f5f5f5] flex items-center justify-center mx-auto mb-3 text-[#c4c4c4]">
        {icon}
      </div>
      <p className="text-[13px] text-[#737373]">{title}</p>
      {hint && <p className="text-[12px] text-[#a3a3a3] mt-0.5">{hint}</p>}
    </div>
  );
}
