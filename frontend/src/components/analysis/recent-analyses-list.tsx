"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Loader2, X } from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/stores";
import { useApiChatStore } from "@/stores/api-chat-store";
import { useLang } from "@/hooks";

interface RecentAnalysesListProps {
  className?: string;
  activeId?: string | null;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function RecentAnalysesList({ className, activeId }: RecentAnalysesListProps) {
  const { t } = useLang();
  const ta = t.analysis;
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const conversations = useApiChatStore((s) => s.conversations);
  const isLoading = useApiChatStore((s) => s.isLoading);
  const deleteConversation = useApiChatStore((s) => s.deleteConversation);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(ta.deleteConfirm)) return;
    try {
      setDeletingId(id);
      await deleteConversation(id);
      if (activeId === id) {
        router.push("/chat");
      }
    } finally {
      setDeletingId(null);
    }
  };

  const items = conversations.map((c) => ({
    id: c.id,
    fileName: c.csvFilename || c.title || ta.newAnalysis,
    timestamp: formatTimestamp(c.updatedAt),
    status: (c.vizCount ?? 0) > 0 ? ta.completedStatus : ta.inProgressStatus,
    chartsCount: c.vizCount ?? 0,
  }));

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="border-border mb-3 border-b pb-2">
        <h2 className="text-foreground font-sans text-[9px] font-bold tracking-widest uppercase">
          {ta.recentAnalyses}
        </h2>
      </div>

      {!isAuthenticated ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted font-mono text-[9px] tracking-wider uppercase">
            {ta.signInToSeeAnalyses}
          </p>
        </div>
      ) : isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="text-muted h-4 w-4 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted font-mono text-[9px] tracking-wider uppercase">
            No recent analyses yet
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <ul className="space-y-px">
            {items.map((item) => {
              const isActive = item.id === activeId;
              const isDeleting = deletingId === item.id;
              return (
                <li key={item.id}>
                  <Link
                    href={`/chat/${item.id}`}
                    className={cn(
                      "flex w-full items-start gap-2 border-l-[3px] px-3 py-2.5 transition-colors",
                      isActive
                        ? "border-accent bg-secondary"
                        : "hover:border-accent/40 hover:bg-secondary border-transparent"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground line-clamp-1 font-sans text-xs font-bold">
                        {item.fileName}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-muted font-mono text-[9px]">{item.timestamp}</span>
                        <span className="text-accent font-mono text-[9px]">
                          {item.chartsCount}ch
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, item.id)}
                      disabled={isDeleting}
                      className="text-muted hover:bg-secondary hover:text-foreground shrink-0 p-1 transition-colors disabled:opacity-50"
                      aria-label="Delete analysis"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                    </button>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
