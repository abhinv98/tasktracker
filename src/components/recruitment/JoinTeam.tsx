"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, Copy } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, useToast } from "@/components/ui";
import { fieldClass } from "@/components/ui/classes";
import type { Row } from "@/lib/hrHealth";
import type { HrData } from "./hrShared";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Someone hired, onto their team in the task tracker: added if they have an
 * account already, otherwise an invite that puts them on it when they sign up.
 */
export function JoinTeam({ row, data, designation }: { row: Row; data: HrData; designation: string }) {
  const team = row.team ?? "";
  const teamName = data.teamName(team);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const typed = email.trim();
  const found = useQuery(api.recruitSetup.joiner, EMAIL.test(typed) ? { candidateId: row._id as Id<"hrRecords">, email: typed } : "skip");
  const addToTeam = useMutation(api.teams.addUserToTeam);
  const invite = useMutation(api.users.createInvite);
  const { toast } = useToast();
  const failed = (err: unknown) => toast("error", err instanceof Error ? err.message : "That did not work");

  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3">
      <label className="block sm:max-w-sm">
        <span className="mb-1 block text-[12px] font-medium text-[var(--text-secondary)]">The email they will sign in with</span>
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setLink("");
            setCopied(false);
          }}
          placeholder="name@ecultify.com"
          className={`${fieldClass} w-full`}
        />
      </label>
      {found &&
        (found.inTeam ? (
          <p className="mt-2 flex items-center gap-1.5 text-[13px] text-[var(--text-primary)]">
            <Check size={14} aria-hidden /> {found.name} is on {teamName}.
          </p>
        ) : found.userId ? (
          <div className="mt-2">
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await addToTeam({ userId: found.userId!, teamId: team as Id<"teams"> });
                  toast("success", `${found.name} is on ${teamName} now`);
                } catch (err) {
                  failed(err);
                }
              }}
            >
              Add {found.name} to {teamName}
            </Button>
          </div>
        ) : link ? (
          <div className="mt-2 flex gap-2">
            <input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.target.select()} className={`${fieldClass} min-w-0 flex-1`} />
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch (err) {
                  failed(err);
                }
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={async () => {
                try {
                  const { token } = await invite({
                    name: String(row.fields.name ?? ""),
                    email: typed,
                    designation: designation || undefined,
                    role: "employee",
                    teamId: team as Id<"teams">,
                  });
                  setLink(`${window.location.origin}/sign-up?invite=${token}`);
                } catch (err) {
                  failed(err);
                }
              }}
            >
              Make an invite to {teamName}
            </Button>
            <span className="text-[12px] text-[var(--text-muted)]">No account with this email yet. Signing up with the invite puts them on the team.</span>
          </div>
        ))}
    </div>
  );
}
