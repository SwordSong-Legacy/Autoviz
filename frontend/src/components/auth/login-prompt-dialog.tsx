"use client";

import { useRouter } from "next/navigation";
import { LogIn, UserPlus, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogCloseButton } from "@/components/ui/dialog";
import { Button } from "@/components/ui";
import { ROUTES } from "@/lib/constants";

interface LoginPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoginPromptDialog({ open, onOpenChange }: LoginPromptDialogProps) {
  const router = useRouter();

  const handleLogin = () => {
    onOpenChange(false);
    router.push(ROUTES.LOGIN);
  };

  const handleRegister = () => {
    onOpenChange(false);
    router.push(ROUTES.REGISTER);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-sm">
        <div className="border-border flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Lock className="text-accent h-4 w-4" />
            <h2 className="font-display text-foreground text-base font-bold tracking-tight uppercase">
              Sign in required
            </h2>
          </div>
          <DialogCloseButton onClick={() => onOpenChange(false)} />
        </div>

        <div className="flex flex-col gap-5 px-6 py-5">
          <div className="space-y-1.5">
            <p className="text-foreground font-sans text-sm">
              Create a free account or sign in to upload CSV/JSON files and start AI-powered
              visualization analysis.
            </p>
            <p className="text-muted font-mono text-[10px]">
              Your data is processed securely and never shared.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <Button onClick={handleLogin} className="w-full">
              <LogIn className="mr-2 h-4 w-4" />
              Log In
            </Button>
            <Button variant="outline" onClick={handleRegister} className="w-full">
              <UserPlus className="mr-2 h-4 w-4" />
              Create Account
            </Button>
          </div>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-muted hover:text-foreground text-center font-mono text-[10px] transition-colors"
          >
            Maybe later
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
