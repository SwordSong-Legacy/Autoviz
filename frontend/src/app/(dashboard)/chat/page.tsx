"use client";

import { usePathname } from "next/navigation";
import { ChatPageLayout } from "@/components/chat/chat-page-layout";

export default function ChatPage() {
  const pathname = usePathname();
  const id = pathname?.match(/\/chat\/(.+)/)?.[1] ?? null;
  return <ChatPageLayout analysisId={id} />;
}
