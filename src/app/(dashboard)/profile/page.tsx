"use client";

import { useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Badge, Button, Card, Input } from "@/components/ui";

export default function ProfilePage() {
  const user = useQuery(api.users.getCurrentUser);
  const updateProfile = useMutation(api.users.updateProfile);
  const { signIn } = useAuthActions();
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [showPwForm, setShowPwForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  if (user === undefined) {
    return (
      <div className="p-8">
        <p className="text-[14px] text-[var(--text-secondary)]">
          Loading...
        </p>
      </div>
    );
  }

  if (user === null) {
    return null;
  }

  const displayName = name || user.name || user.email || "";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      await updateProfile({ name: displayName });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");

    if (newPassword.length < 8) {
      setPwError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("Passwords do not match");
      return;
    }

    try {
      await signIn("password", {
        email: user!.email!,
        password: newPassword,
        flow: "signUp",
      });
      setPwSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
      setShowPwForm(false);
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err) {
      setPwError(
        err instanceof Error ? err.message : "Failed to change password"
      );
    }
  }

  return (
    <div className="p-8 max-w-xl">
      <h1 className="font-bold text-[24px] text-[var(--text-primary)] tracking-tight mb-2">
        Profile
      </h1>
      <p className="text-[14px] text-[var(--text-secondary)] mb-8">
        Manage your account
      </p>

      <Card>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <Input
            label="Name"
            value={displayName}
            onChange={(e) => setName(e.target.value)}
          />
          <div>
            <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-2">
              Email
            </label>
            <p className="text-[var(--text-primary)]">
              {user.email ?? "—"}
            </p>
          </div>
          <div>
            <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-2">
              Role
            </label>
            <Badge variant={user.role === "admin" ? "admin" : user.role === "manager" ? "manager" : "employee"}>
              {user.role ?? "employee"}
            </Badge>
          </div>
          <Button type="submit" variant="primary">
            {saved ? "Saved" : "Save"}
          </Button>
        </form>
      </Card>

      <Card className="mt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-[16px] text-[var(--text-primary)]">
              Password
            </h2>
            <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
              Update your password
            </p>
          </div>
          {!showPwForm && (
            <Button variant="secondary" onClick={() => setShowPwForm(true)}>
              Change Password
            </Button>
          )}
        </div>

        {pwSuccess && (
          <div className="bg-[var(--accent-employee-dim)] border border-[var(--accent-employee)] text-[var(--accent-employee)] rounded-lg px-4 py-2 text-[13px] mb-4">
            Password updated successfully
          </div>
        )}

        {showPwForm && (
          <form onSubmit={handlePasswordChange} className="flex flex-col gap-4">
            <Input
              label="New Password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password (min 8 characters)"
            />
            <Input
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
            {pwError && (
              <p className="text-[13px] text-[var(--danger)]">{pwError}</p>
            )}
            <div className="flex gap-2">
              <Button type="submit" variant="primary">
                Update Password
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowPwForm(false);
                  setPwError("");
                  setNewPassword("");
                  setConfirmPassword("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
