"use client";

import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Download, FileText } from "lucide-react";

interface FilePreviewModalProps {
  file: { name: string; url: string };
  onClose: () => void;
}

function isImageFile(name: string) {
  return /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(name);
}

function isVideoFile(name: string) {
  return /\.(mp4|webm|ogg|mov)$/i.test(name);
}

function isPdfFile(name: string) {
  return /\.pdf$/i.test(name);
}

export function FilePreviewModal({ file, onClose }: FilePreviewModalProps) {
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const image = isImageFile(file.name);
  const video = isVideoFile(file.name);
  const pdf = isPdfFile(file.name);
  const canPreview = image || video || pdf;

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/60 z-[100] animate-fadeIn"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
        <div
          className="relative w-full max-w-3xl max-h-[85vh] bg-white rounded-xl border border-[var(--border)] shadow-2xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
              <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                {file.name}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <a
                href={file.url}
                download={file.name}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white bg-[var(--accent-admin)] hover:bg-[#c4684d] transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </a>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Preview area */}
          <div className="flex-1 overflow-auto flex items-center justify-center bg-[var(--bg-primary)] p-4">
            {image && (
              <img
                src={file.url}
                alt={file.name}
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            )}
            {video && (
              <video
                src={file.url}
                controls
                className="max-w-full max-h-[70vh] rounded-lg"
              />
            )}
            {pdf && (
              <iframe
                src={file.url}
                title={file.name}
                className="w-full h-[70vh] rounded-lg border border-[var(--border)]"
              />
            )}
            {!canPreview && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <FileText className="h-12 w-12 text-[var(--text-muted)]" />
                <p className="text-[14px] font-medium text-[var(--text-primary)]">
                  {file.name}
                </p>
                <p className="text-[12px] text-[var(--text-secondary)]">
                  Preview not available for this file type
                </p>
                <a
                  href={file.url}
                  download={file.name}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium text-white bg-[var(--accent-admin)] hover:bg-[#c4684d] transition-colors mt-2"
                >
                  <Download className="h-4 w-4" />
                  Download File
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
