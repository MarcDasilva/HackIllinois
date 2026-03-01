"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ToastErrorProps = {
  message: string | null;
  onDismiss: () => void;
  className?: string;
};

/**
 * Fixed bottom-right error toast. Renders nothing when message is null.
 */
export function ToastError({ message, onDismiss, className }: ToastErrorProps) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={cn(
        "fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive shadow-lg",
        className
      )}
    >
      <span className="flex-1 break-words">{message}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/20"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
