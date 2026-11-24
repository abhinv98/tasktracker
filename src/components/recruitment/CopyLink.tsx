"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { applyLink } from "@/lib/applyLink";

/** Copies the application link of one opening. `off` says why there is none to give out. */
export function CopyLink({ code, label = "Copy application link", off }: { code: string; label?: string; off?: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      disabled={!!off}
      title={off ?? applyLink(code)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(applyLink(code));
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
          toast("success", `Link for ${code} copied. The form opens with only this position.`);
        } catch {
          toast("error", `Could not copy. The link is ${applyLink(code)}`);
        }
      }}
    >
      {copied ? <Check size={13} /> : <Link2 size={13} />}
      {copied ? "Copied" : label}
    </Button>
  );
}
