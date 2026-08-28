"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth, useLang } from "@/hooks";
import { Input, Label, Button } from "@/components/ui";
import { ApiError } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";

const MIN_PASSWORD_LENGTH = 8;

// Decorative bar heights for the left panel chart illustration
const BAR_HEIGHTS = [40, 28, 52, 18, 44, 34, 56, 22, 38, 48];

export function LoginForm() {
  const { login } = useAuth();
  const { t } = useLang();
  const ta = t.auth;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(ta.passwordTooShort(MIN_PASSWORD_LENGTH));
      return;
    }

    setIsLoading(true);
    try {
      await login({ email, password });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : ta.loginFailed);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[40%_60%]">
      {/* Left panel — dark, decorative */}
      <div className="bg-foreground hidden flex-col justify-between p-10 md:flex">
        <div>
          <p className="text-muted font-mono text-[9px] tracking-[3px] uppercase">AutoViz · v2.0</p>
        </div>
        <div>
          <h1 className="font-display text-background text-5xl leading-tight font-black tracking-tight whitespace-pre-line uppercase">
            {ta.leftPanelTagline}
          </h1>
        </div>
        <div>
          {/* Decorative bar chart */}
          <div className="mb-4 flex items-end gap-1.5">
            {BAR_HEIGHTS.map((h, i) => (
              <div
                key={i}
                className={`bg-accent h-[var(--bar-h)] w-3 flex-shrink-0 ${i % 3 === 1 ? "opacity-30" : "opacity-100"}`}
                style={{ "--bar-h": `${h}px` } as React.CSSProperties}
              />
            ))}
          </div>
          <p className="text-muted max-w-xs font-sans text-xs leading-relaxed">
            {ta.leftPanelDesc}
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="bg-background flex flex-col items-center justify-center px-6 py-16 sm:px-12">
        <div className="w-full max-w-sm">
          <div className="border-foreground mb-8 border-b-[3px] pb-4">
            <h2 className="font-display text-foreground text-3xl font-bold tracking-tight uppercase">
              {ta.loginTitle}
            </h2>
            <p className="text-muted mt-1 font-mono text-[10px] tracking-widest uppercase">
              {ta.loginSubtitle}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="text-muted font-sans text-[10px] font-bold tracking-widest uppercase"
              >
                {ta.email}
              </Label>
              <Input
                id="email"
                type="email"
                placeholder={ta.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-muted font-sans text-[10px] font-bold tracking-widest uppercase"
              >
                {ta.password}
              </Label>
              <Input
                id="password"
                type="password"
                placeholder={ta.passwordPlaceholder(MIN_PASSWORD_LENGTH)}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p role="alert" className="text-destructive font-mono text-xs">
                {error}
              </p>
            )}

            <Button type="submit" disabled={isLoading} className="w-full py-3">
              {isLoading ? ta.signingIn : ta.signInBtn}
            </Button>
          </form>

          <p className="text-muted mt-6 text-center font-sans text-xs">
            {ta.noAccount}{" "}
            <Link
              href={ROUTES.REGISTER}
              className="text-accent font-bold underline-offset-2 hover:underline"
            >
              {ta.registerHere}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
