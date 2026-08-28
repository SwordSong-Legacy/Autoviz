"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, useLang } from "@/hooks";
import { Input, Label, Button } from "@/components/ui";
import { ApiError } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";

const MIN_PASSWORD_LENGTH = 8;

const BAR_HEIGHTS = [40, 28, 52, 18, 44, 34, 56, 22, 38, 48];

export function RegisterForm() {
  const router = useRouter();
  const { register } = useAuth();
  const { t } = useLang();
  const ta = t.auth;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(ta.passwordTooShort(MIN_PASSWORD_LENGTH));
      return;
    }
    if (password !== confirmPassword) {
      setError(ta.passwordMismatch);
      return;
    }

    setIsLoading(true);
    try {
      await register({ email, password, name: name || undefined });
      router.push(ROUTES.LOGIN + "?registered=true");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : ta.registerFailed);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[40%_60%]">
      {/* Left panel */}
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
              {ta.registerTitle}
            </h2>
            <p className="text-muted mt-1 font-mono text-[10px] tracking-widest uppercase">
              {ta.registerSubtitle}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="name"
                className="text-muted font-sans text-[10px] font-bold tracking-widest uppercase"
              >
                {ta.name}
              </Label>
              <Input
                id="name"
                type="text"
                placeholder={ta.namePlaceholder}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
              />
            </div>

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
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="confirmPassword"
                className="text-muted font-sans text-[10px] font-bold tracking-widest uppercase"
              >
                {ta.confirmPassword}
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder={ta.confirmPlaceholder}
                value={confirmPassword}
                onChange={(e) => setConfirm(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="new-password"
              />
            </div>

            {error && (
              <p role="alert" className="text-destructive font-mono text-xs">
                {error}
              </p>
            )}

            <Button type="submit" disabled={isLoading} className="w-full py-3">
              {isLoading ? ta.creatingAccount : ta.createAccountBtn}
            </Button>
          </form>

          <p className="text-muted mt-6 text-center font-sans text-xs">
            {ta.haveAccount}{" "}
            <Link
              href={ROUTES.LOGIN}
              className="text-accent font-bold underline-offset-2 hover:underline"
            >
              {ta.signInLink}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
