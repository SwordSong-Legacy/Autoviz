"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, LogIn } from "lucide-react";
import { Dialog, DialogContent, DialogCloseButton } from "@/components/ui/dialog";
import { Button } from "@/components/ui";
import { useAuthStore } from "@/stores";
import { ROUTES } from "@/lib/constants";

/**
 * Listens for the global `auth:session-expired` event dispatched by api-client
 * whenever the backend returns 401. Only shows the dialog when the user was
 * previously authenticated so we don't interfere with normal login flows.
 */
export function SessionExpiredDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { isAuthenticated, logout } = useAuthStore();

  useEffect(() => {
    const handleSessionExpired = () => {
      // Only intercept when the user had an active session
      if (!useAuthStore.getState().isAuthenticated) return;
      logout();
      setOpen(true);
    };

    window.addEventListener("auth:session-expired", handleSessionExpired);
    return () => window.removeEventListener("auth:session-expired", handleSessionExpired);
  }, [logout]);

  // If user re-authenticates in another tab or the dialog is dismissed after
  // logging in, close automatically.
  useEffect(() => {
    if (isAuthenticated) setOpen(false);
  }, [isAuthenticated]);

  const handleLogin = () => {
    setOpen(false);
    router.push(ROUTES.LOGIN);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[90vw] max-w-sm">
        <div className="border-border flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Clock className="text-accent h-4 w-4" />
            <h2 className="font-display text-foreground text-base font-bold tracking-tight uppercase">
              Session expired
            </h2>
          </div>
          <DialogCloseButton onClick={() => setOpen(false)} />
        </div>

        <div className="flex flex-col gap-5 px-6 py-5">
          <div className="space-y-1.5">
            <p className="text-foreground font-sans text-sm">
              Your session has expired. Please log in again to continue.
            </p>
            <p className="text-muted font-mono text-[10px]">
              Any unsaved changes may have been lost.
            </p>
          </div>

          <Button onClick={handleLogin} className="w-full">
            <LogIn className="mr-2 h-4 w-4" />
            Log in again
          </Button>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-muted hover:text-foreground text-center font-mono text-[10px] transition-colors"
          >
            Dismiss
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
