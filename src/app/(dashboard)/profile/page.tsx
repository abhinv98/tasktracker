"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useState, useRef } from "react";
import { api } from "@/convex/_generated/api";
import { Badge, Button, Card, Input, useToast } from "@/components/ui";
import { Camera, X, Loader2 } from "lucide-react";
import { getDisplayRole } from "@/lib/roles";

export default function ProfilePage() {
  const user = useQuery(api.users.getCurrentUser);
  const updateProfile = useMutation(api.users.updateProfile);
  const updateProfileImage = useMutation(api.users.updateProfileImage);
  const removeProfileImage = useMutation(api.users.removeProfileImage);
  const generateUploadUrl = useMutation(api.users.generateProfileUploadUrl);
  const changePasswordAction = useAction(api.passwordChange.changePassword);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [showPwForm, setShowPwForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();

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
      toast("success", "Profile updated");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to update profile");
    }
  }

  async function handlePhotoUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast("error", "Please upload an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast("error", "Image must be under 5MB");
      return;
    }
    setUploadingPhoto(true);
    try {
      const url = await generateUploadUrl();
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      const { storageId } = await res.json();
      await updateProfileImage({ storageId });
      toast("success", "Profile photo updated");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to upload photo");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleRemovePhoto() {
    try {
      await removeProfileImage();
      toast("success", "Profile photo removed");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to remove photo");
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");

    if (!currentPassword) {
      setPwError("Please enter your current password");
      return;
    }
    if (newPassword.length < 8) {
      setPwError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("Passwords do not match");
      return;
    }

    setPwSaving(true);
    try {
      await changePasswordAction({ currentPassword, newPassword });
      setPwSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowPwForm(false);
      setTimeout(() => setPwSuccess(false), 3000);
      toast("success", "Password updated");
    } catch (err) {
      setPwError(
        err instanceof Error ? err.message : "Failed to change password"
      );
    } finally {
      setPwSaving(false);
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
          {/* Profile Photo */}
          <div>
            <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-3">
              Profile Photo
            </label>
            <div className="flex items-center gap-4">
              <div className="relative group">
                {user.avatarUrl || user.image ? (
                  <img
                    src={user.avatarUrl || user.image}
                    alt="Profile"
                    className="w-20 h-20 rounded-full object-cover border-2 border-[var(--border)]"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-[var(--accent-admin)] flex items-center justify-center border-2 border-[var(--border)]">
                    <span className="text-white text-[24px] font-bold">
                      {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors cursor-pointer"
                >
                  {uploadingPhoto ? (
                    <Loader2 className="h-5 w-5 text-white animate-spin" />
                  ) : (
                    <Camera className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePhotoUpload(file);
                    e.target.value = "";
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="text-[13px] font-medium text-[var(--accent-admin)] hover:underline disabled:opacity-50 text-left"
                >
                  {uploadingPhoto ? "Uploading..." : "Upload photo"}
                </button>
                {(user.avatarUrl || user.image) && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="text-[13px] font-medium text-[var(--danger)] hover:underline text-left"
                  >
                    Remove photo
                  </button>
                )}
                <p className="text-[11px] text-[var(--text-muted)]">
                  JPG, PNG or GIF. Max 5MB.
                </p>
              </div>
            </div>
          </div>

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
            <Badge variant={user.role === "admin" ? "admin" : "employee"}>
              {getDisplayRole(user)}
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
              label="Current Password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter your current password"
            />
            <Input
              label="New Password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password (min 8 characters)"
            />
            <Input
              label="Confirm New Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
            {pwError && (
              <p className="text-[13px] text-[var(--danger)]">{pwError}</p>
            )}
            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={pwSaving}>
                {pwSaving ? "Updating..." : "Update Password"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowPwForm(false);
                  setPwError("");
                  setCurrentPassword("");
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
