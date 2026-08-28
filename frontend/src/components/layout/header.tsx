"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth, useLang } from "@/hooks";
import { Button } from "@/components/ui";
import { ThemeToggle } from "@/components/theme";
import { OpenRouterConfigModal } from "@/components/settings/openrouter-config-modal";
import { ROUTES } from "@/lib/constants";
import { Menu, Settings } from "lucide-react";
import { useSidebarStore } from "@/stores";
import { cn } from "@/lib/utils";

export function Header() {
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuth();
  const { toggle } = useSidebarStore();
  const [openRouterModalOpen, setOpenRouterModalOpen] = useState(false);
  const { t, toggleLang } = useLang();

  const NAV_LINKS = [
    { label: t.nav.analysis, href: ROUTES.CHAT, match: "/chat" },
    { label: t.nav.dashboard, href: ROUTES.DASHBOARD, match: "/dashboard" },
    { label: t.nav.profile, href: ROUTES.PROFILE, match: "/profile" },
  ];

  return (
    <header className="border-foreground bg-background sticky top-0 z-40 w-full border-b-[3px]">
      <div className="flex h-14 items-center justify-between px-4 sm:px-6">
        {/* Left: hamburger (mobile) + logo */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggle}
            className="text-foreground focus-visible:outline-accent flex h-8 w-8 items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 md:hidden"
            aria-label="Toggle menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link
            href={ROUTES.HOME}
            className="font-display text-foreground hover:text-accent text-xl font-black tracking-tight uppercase transition-colors"
          >
            AUTOVIZ
          </Link>
        </div>

        {/* Center: nav links (desktop) */}
        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map(({ label, href, match }) => {
            const isActive = pathname?.startsWith(match) ?? false;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "pb-0.5 text-xs font-bold tracking-widest uppercase transition-colors",
                  isActive
                    ? "border-accent text-foreground border-b-2"
                    : "text-muted hover:text-foreground"
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Right: lang toggle, settings, theme, auth */}
        <div className="flex items-center gap-2">
          {/* Language toggle */}
          <button
            type="button"
            onClick={toggleLang}
            className="border-border text-muted hover:border-foreground hover:text-foreground border px-2.5 py-1 font-mono text-[10px] font-medium tracking-widest uppercase transition-colors"
            aria-label="Switch language"
          >
            {t.langToggle}
          </button>

          <button
            type="button"
            onClick={() => setOpenRouterModalOpen(true)}
            className="text-muted hover:text-foreground focus-visible:outline-accent flex h-8 w-8 items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            aria-label="OpenRouter Configuration"
          >
            <Settings className="h-4 w-4" />
          </button>
          <ThemeToggle />

          {isAuthenticated ? (
            <>
              <Link
                href={ROUTES.PROFILE}
                className="text-muted hover:text-foreground hidden max-w-32 truncate text-xs font-bold tracking-widest uppercase transition-colors sm:block"
              >
                {user?.email}
              </Link>
              <Button variant="outline" size="sm" onClick={logout}>
                {t.nav.signOut}
              </Button>
            </>
          ) : (
            <>
              <Link
                href={ROUTES.LOGIN}
                className="text-muted hover:text-foreground hidden text-xs font-bold tracking-widest uppercase transition-colors sm:block"
              >
                {t.nav.signIn}
              </Link>
              <Button variant="accent" size="sm" asChild>
                <Link href={ROUTES.REGISTER}>{t.nav.register}</Link>
              </Button>
            </>
          )}
        </div>
      </div>

      <OpenRouterConfigModal open={openRouterModalOpen} onOpenChange={setOpenRouterModalOpen} />
    </header>
  );
}
