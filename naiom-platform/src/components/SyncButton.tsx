"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { cn } from "@/lib/utils";

export function SyncButton({
  className,
  endpoint,
  label,
  disabled,
  disabledReason,
}: {
  className?: string;
  endpoint?: string;
  label?: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [isPending, startTransition] = useTransition();

  const handleSync = () => {
    startTransition(async () => {
      // Sync implementation
    });
  };

  return (
    <button
      onClick={handleSync}
      disabled={disabled || isPending}
      title={disabledReason}
      className={cn(
        "px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50",
        className
      )}
    >
      {isPending ? "Syncing..." : label || "Sync"}
    </button>
  );
}
