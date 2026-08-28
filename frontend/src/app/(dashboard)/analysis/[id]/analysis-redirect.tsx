"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function AnalysisRedirect({ id }: { id: string }) {
  const pathname = usePathname();

  useEffect(() => {
    const match = pathname?.match(/\/analysis\/(.+)/);
    const targetId = match?.[1] ?? id;
    window.location.href = `/chat/${targetId}`;
  }, [pathname, id]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Redirecting...</p>
    </div>
  );
}
