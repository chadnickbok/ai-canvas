import React, { useEffect } from "react";

import type { AppMetadata } from "@ai-canvas/ipc-contract";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatChannelLabel(channel: AppMetadata["channel"] | undefined): string {
  return channel === "beta" ? "Beta" : "Stable";
}

function formatCommitSha(commitSha: string | null | undefined): string {
  if (typeof commitSha !== "string" || commitSha.trim().length === 0) {
    return "Unavailable in this build";
  }

  return commitSha.trim();
}

export function AboutDialog({
  appMetadata,
  isOpen,
  onClose
}: {
  appMetadata: AppMetadata | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/34 px-5 py-6"
      data-about-dialog="true"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="w-full max-w-[520px] border border-black/12 bg-white p-6 text-[#111111] shadow-[0_28px_80px_rgba(0,0,0,0.18)]"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-black/10 pb-4">
          <div className="flex flex-col gap-2">
            <span className="ui-mono text-[11px] uppercase tracking-[0.18em] text-black/42">
              Desktop build
            </span>
            <h2 className="m-0 text-[28px] font-semibold tracking-[-0.05em] text-[#111111]">
              About AI Canvas Desktop
            </h2>
          </div>

          <button
            className="ui-mono shrink-0 border border-black/12 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[#111111] transition hover:border-black"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          {[
            {
              label: "Version",
              value: appMetadata?.version ?? "Unavailable"
            },
            {
              label: "Release channel",
              value: formatChannelLabel(appMetadata?.channel)
            },
            {
              label: "Commit SHA",
              value: formatCommitSha(appMetadata?.commitSha)
            }
          ].map((row) => (
            <div
              className="grid gap-2 border border-black/10 bg-[#faf9f5] px-4 py-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center"
              key={row.label}
            >
              <span className="ui-mono text-[11px] uppercase tracking-[0.16em] text-black/42">
                {row.label}
              </span>
              <span
                className={cn(
                  "text-[15px] leading-7 text-[#111111]",
                  row.label === "Commit SHA" && "ui-mono text-[13px]"
                )}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>

        <p className="m-0 mt-5 border-t border-black/10 pt-4 text-[14px] leading-7 text-black/66">
          Update checks, download state, and restart-to-install controls arrive in phase 2. This
          surface is read-only in phase 1.
        </p>
      </div>
    </div>
  );
}
