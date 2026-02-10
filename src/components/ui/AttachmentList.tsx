"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Paperclip, Download, Trash2, Loader2 } from "lucide-react";

interface AttachmentListProps {
  parentType: "brief" | "task";
  parentId: string;
}

export function AttachmentList({ parentType, parentId }: AttachmentListProps) {
  const attachments = useQuery(api.attachments.getAttachments, { parentType, parentId });
  const addAttachment = useMutation(api.attachments.addAttachment);
  const deleteAttachment = useMutation(api.attachments.deleteAttachment);
  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl);
  const user = useQuery(api.users.getCurrentUser);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await res.json();
      await addAttachment({
        parentType,
        parentId,
        fileId: storageId,
        fileName: file.name,
        fileType: file.type,
      });
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-[12px] text-[var(--text-secondary)] uppercase tracking-wide">
          Files ({attachments?.length ?? 0})
        </h4>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex items-center gap-1 text-[11px] font-medium text-[var(--accent-admin)] hover:underline disabled:opacity-50"
        >
          {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
          {isUploading ? "Uploading..." : "Attach file"}
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {attachments?.map((att) => (
          <div
            key={att._id}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] group"
          >
            <Paperclip className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">
                {att.fileName}
              </p>
              <p className="text-[10px] text-[var(--text-muted)]">
                {att.uploaderName}
              </p>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {att.url && (
                <a
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent-admin)]"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
              )}
              {(att.uploadedBy === user?._id || user?.role === "admin") && (
                <button
                  onClick={() => deleteAttachment({ attachmentId: att._id })}
                  className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--danger)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
        {attachments?.length === 0 && (
          <p className="text-[11px] text-[var(--text-muted)]">No files attached.</p>
        )}
      </div>
    </div>
  );
}
