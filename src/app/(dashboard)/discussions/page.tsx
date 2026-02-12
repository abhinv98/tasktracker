"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { CommentThread } from "@/components/comments/CommentThread";
import {
  MessageCircle,
  Search,
  Briefcase,
  Calendar,
  Users,
  ChevronRight,
  Hash,
} from "lucide-react";

export default function DiscussionsPage() {
  const user = useQuery(api.users.getCurrentUser);
  const briefs = useQuery(api.briefs.listBriefs, {});
  const unreadCounts = useQuery(api.comments.getUnreadCounts);
  const markRead = useMutation(api.comments.markBriefRead);
  const [selectedBriefId, setSelectedBriefId] = useState<Id<"briefs"> | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");

  // Mark as read when opening a brief
  useEffect(() => {
    if (selectedBriefId) {
      markRead({ briefId: selectedBriefId });
    }
  }, [selectedBriefId, markRead]);

  // Get tasks & members for the selected brief
  const tasksData = useQuery(
    api.tasks.listTasksForBrief,
    selectedBriefId ? { briefId: selectedBriefId } : "skip"
  );
  const graphData = useQuery(
    api.briefs.getBriefGraphData,
    selectedBriefId ? { briefId: selectedBriefId } : "skip"
  );

  const selectedBrief = useMemo(
    () => briefs?.find((b) => b._id === selectedBriefId) ?? null,
    [briefs, selectedBriefId]
  );

  // Filter briefs that are not archived and match search
  const filteredBriefs = useMemo(() => {
    if (!briefs) return [];
    let list = briefs.filter((b) => b.status !== "archived");
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.managerName?.toLowerCase().includes(q) ||
          b.teamNames?.some((tn) => tn?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [briefs, searchQuery]);

  // Derive members from graph data
  const employeesInBriefTeams =
    graphData?.teams.flatMap((t) => t.members.map((m) => m.user)) ?? [];
  const uniqueEmployees = [
    ...new Map(employeesInBriefTeams.map((e) => [e._id, e])).values(),
  ];
  const allTasks = tasksData?.tasks ?? [];

  if (!user) return null;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-[var(--bg-primary)]">
      {/* Left Panel - Brief List */}
      <div className="w-80 shrink-0 flex flex-col border-r border-[var(--border)] bg-white">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 mb-3">
            <MessageCircle className="h-4 w-4 text-[var(--accent-admin)]" />
            <h1 className="font-semibold text-[15px] text-[var(--text-primary)]">
              Discussions
            </h1>
          </div>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search briefs..."
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-admin)]"
            />
          </div>
        </div>

        {/* Brief list */}
        <div className="flex-1 overflow-y-auto">
          {filteredBriefs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <Briefcase className="h-8 w-8 text-[var(--text-disabled)] mb-2" />
              <p className="text-[12px] text-[var(--text-muted)] text-center">
                {searchQuery
                  ? "No briefs match your search"
                  : "No active briefs found"}
              </p>
            </div>
          )}
          {filteredBriefs.map((brief) => {
            const isSelected = selectedBriefId === brief._id;
            const statusColor =
              brief.status === "active" || brief.status === "in-progress"
                ? "var(--accent-employee)"
                : brief.status === "review"
                  ? "var(--accent-admin)"
                  : brief.status === "completed"
                    ? "var(--accent-employee)"
                    : "var(--text-muted)";
            return (
              <button
                key={brief._id}
                onClick={() => setSelectedBriefId(brief._id)}
                className={`w-full text-left px-4 py-3 border-b border-[var(--border-subtle)] transition-colors ${
                  isSelected
                    ? "bg-[var(--accent-admin-dim)] border-l-[3px] border-l-[var(--accent-admin)]"
                    : "hover:bg-[var(--bg-hover)] border-l-[3px] border-l-transparent"
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Hash className="h-3 w-3 text-[var(--text-muted)] shrink-0" />
                      <span className="font-medium text-[13px] text-[var(--text-primary)] truncate">
                        {brief.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium capitalize"
                        style={{
                          color: statusColor,
                          backgroundColor: `color-mix(in srgb, ${statusColor} 12%, transparent)`,
                        }}
                      >
                        {brief.status}
                      </span>
                      {brief.managerName && (
                        <span className="text-[10px] text-[var(--text-muted)] truncate">
                          {brief.managerName}
                        </span>
                      )}
                    </div>
                    {brief.teamNames && brief.teamNames.length > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        <Users className="h-2.5 w-2.5 text-[var(--text-disabled)]" />
                        <span className="text-[10px] text-[var(--text-disabled)] truncate">
                          {brief.teamNames.join(", ")}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {unreadCounts?.[brief._id] ? (
                      <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[var(--accent-admin)] text-white text-[9px] font-bold px-1">
                        {unreadCounts[brief._id]}
                      </span>
                    ) : null}
                    {isSelected && (
                      <ChevronRight className="h-3.5 w-3.5 text-[var(--accent-admin)]" />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Brief count */}
        <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--bg-primary)]">
          <p className="text-[10px] text-[var(--text-muted)]">
            {filteredBriefs.length} brief
            {filteredBriefs.length !== 1 ? "s" : ""} available
          </p>
        </div>
      </div>

      {/* Right Panel - Chat Thread */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedBrief ? (
          <>
            {/* Chat Header */}
            <div className="px-5 py-3 border-b border-[var(--border)] bg-white flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent-admin-dim)] flex items-center justify-center">
                <Hash className="h-4 w-4 text-[var(--accent-admin)]" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-[14px] text-[var(--text-primary)] truncate">
                  {selectedBrief.title}
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    {selectedBrief.taskCount} task
                    {selectedBrief.taskCount !== 1 ? "s" : ""}
                  </span>
                  {selectedBrief.managerName && (
                    <>
                      <span className="text-[var(--text-disabled)]">
                        &middot;
                      </span>
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        {selectedBrief.managerName}
                      </span>
                    </>
                  )}
                  {selectedBrief.deadline && (
                    <>
                      <span className="text-[var(--text-disabled)]">
                        &middot;
                      </span>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-[var(--text-muted)]" />
                        <span className="text-[11px] text-[var(--text-secondary)]">
                          {new Date(selectedBrief.deadline).toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric", year: "numeric" }
                          )}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
              {/* Progress indicator */}
              {selectedBrief.taskCount > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--accent-employee)] transition-all duration-300"
                      style={{
                        width: `${Math.round(selectedBrief.progress)}%`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-[var(--text-muted)] tabular-nums">
                    {Math.round(selectedBrief.progress)}%
                  </span>
                </div>
              )}
            </div>

            {/* Chat Thread - Full Page */}
            <div className="flex-1 min-h-0 px-5 py-4 flex flex-col">
              <CommentThread
                parentType="brief"
                parentId={selectedBriefId!}
                briefId={selectedBriefId!}
                tasks={allTasks.map((t) => ({ _id: t._id, title: t.title }))}
                members={uniqueEmployees.map((e) => ({
                  _id: e._id,
                  name: e.name,
                  email: e.email,
                }))}
                fullPage
              />
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-xs">
              <div className="w-16 h-16 rounded-2xl bg-[var(--accent-admin-dim)] flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="h-8 w-8 text-[var(--accent-admin)]" />
              </div>
              <h2 className="font-semibold text-[16px] text-[var(--text-primary)] mb-2">
                Brief Discussions
              </h2>
              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-1">
                Select a brief from the left to view and participate in its
                discussion thread.
              </p>
              <p className="text-[11px] text-[var(--text-muted)]">
                All team members can collaborate here with @mentions and
                task-specific messages.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
