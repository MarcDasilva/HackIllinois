"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function AuthErrorToast({
  message,
  onDismiss,
  autoDismissMs = 6000,
}: {
  message: string;
  onDismiss: () => void;
  autoDismissMs?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(t);
  }, [message, onDismiss, autoDismissMs]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 24, y: 24 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: 24 }}
      className="fixed bottom-6 right-6 z-[100] max-w-sm rounded-lg border border-border bg-secondary px-4 py-3 shadow-lg"
      role="alert"
    >
      <p className="text-sm text-foreground">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-2 text-xs text-muted-foreground underline hover:text-foreground"
      >
        Dismiss
      </button>
    </motion.div>
  );
}
