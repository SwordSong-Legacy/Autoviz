"use client";

import { useState } from "react";
import { useAuth, useLang } from "@/hooks";
import { useAuthStore } from "@/stores";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function ProfilePage() {
  const { t } = useLang();
  const tp = t.profile;
  const { user } = useAuthStore();
  const { logout } = useAuth();

  // User has email and optional username — no name field
  const displayName = user?.username ?? user?.email ?? "?";
  const initials = displayName
    .split(/[\s@]/)
    .map((p: string) => p[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");

  const [username, setUsername] = useState(user?.username ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    // Profile update API not yet implemented — show confirmation only
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="border-foreground bg-background border-b-[3px] px-6 py-4">
        <h1 className="font-display text-foreground text-2xl font-bold tracking-tight uppercase">
          {tp.title}
        </h1>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col md:flex-row">
        {/* Left panel — avatar + info */}
        <div className="border-foreground bg-surface flex flex-col items-center gap-4 border-b-[2px] p-8 md:w-48 md:border-r-[2px] md:border-b-0">
          {/* Avatar */}
          <div className="bg-foreground font-display text-background flex h-16 w-16 items-center justify-center text-2xl font-black uppercase">
            {initials}
          </div>
          <div className="text-center">
            <p className="text-foreground font-sans text-sm font-bold">
              {user?.username ? user.username : "—"}
            </p>
            <p className="text-muted font-mono text-[9px] tracking-wider uppercase">
              {user?.email}
            </p>
          </div>
        </div>

        {/* Right panel — settings form */}
        <div className="flex-1 p-6 sm:p-8">
          <div className="border-foreground mb-6 border-b-[2px] pb-3">
            <h2 className="font-display text-foreground text-xl font-bold tracking-tight uppercase">
              {tp.accountSettings}
            </h2>
          </div>

          <form onSubmit={handleSave} className="max-w-lg space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label
                  htmlFor="profile-username"
                  className="text-muted font-sans text-[10px] font-bold tracking-widest uppercase"
                >
                  {tp.username}
                </Label>
                <Input
                  id="profile-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={tp.usernamePlaceholder}
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="profile-email"
                  className="text-muted font-sans text-[10px] font-bold tracking-widest uppercase"
                >
                  {tp.email}
                </Label>
                <Input
                  id="profile-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.auth.emailPlaceholder}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="profile-password"
                className="text-muted font-sans text-[10px] font-bold tracking-widest uppercase"
              >
                {tp.newPassword}
              </Label>
              <Input
                id="profile-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tp.passwordPlaceholder}
                autoComplete="new-password"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" variant="default">
                {saved ? tp.saved : tp.saveChanges}
              </Button>
              <Button type="button" variant="outline" onClick={logout}>
                {tp.signOut}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
