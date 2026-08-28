"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { useSidebarStore } from "@/stores";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui";

const NAV_LINKS = [
  { label: "Analysis", href: ROUTES.CHAT, match: "/chat" },
  { label: "History", href: ROUTES.DASHBOARD, match: "/dashboard" },
  { label: "Profile", href: ROUTES.PROFILE, match: "/profile" },
];

export function Sidebar() {
  const { isOpen, close } = useSidebarStore();
  const pathname = usePathname();

  return (
    <Sheet open={isOpen} onOpenChange={() => close()}>
      <SheetContent
        side="left"
        className="border-foreground bg-background w-72 rounded-none border-r-[3px] p-0"
      >
        <SheetHeader className="border-foreground flex h-14 flex-row items-center justify-between border-b-[3px] px-4">
          <SheetTitle className="font-display text-foreground text-xl font-black tracking-tight uppercase">
            OUT OF BITS
          </SheetTitle>
          <SheetClose
            onClick={close}
            className="text-muted hover:text-foreground transition-colors"
          />
        </SheetHeader>
        <nav className="flex flex-col gap-1 p-4">
          {NAV_LINKS.map(({ label, href, match }) => {
            const isActive = pathname?.startsWith(match) ?? false;
            return (
              <Link
                key={href}
                href={href}
                onClick={close}
                className={cn(
                  "flex items-center px-3 py-3 text-xs font-bold tracking-widest uppercase transition-colors",
                  isActive
                    ? // pl-[9px]: px-3 (12px) minus 3px left border = 9px, preserves visual alignment
                      "border-accent bg-accent-light text-accent border-l-[3px] pl-[9px]"
                    : "text-muted hover:text-foreground"
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
