"use client";

import { useState } from "react";
import { X, Clock } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function GuestBanner() {
  const { isSignedIn, isLoaded } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  if (!isLoaded || isSignedIn || dismissed) return null;

  return (
    <>
      <div className="w-full bg-gradient-to-r from-indigo-950/80 via-purple-950/80 to-indigo-950/80 border-b border-indigo-800/40 backdrop-blur-sm px-4 py-2 flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 text-indigo-300 min-w-0">
          <Clock size={14} className="shrink-0 text-indigo-400" />
          <span className="truncate">
            <span className="font-medium text-indigo-200">Guest mode</span>
            {" — "}your PDFs are saved for{" "}
            <span className="font-medium text-indigo-200">48 hours</span>.
            {" "}Sign in to keep them permanently.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setDismissed(true)}
            className="text-gray-500 hover:text-gray-300 transition-colors p-1 rounded"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </>
  );
}
