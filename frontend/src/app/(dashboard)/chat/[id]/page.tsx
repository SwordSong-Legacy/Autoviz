import { ChatPageLayout } from "@/components/chat/chat-page-layout";

export async function generateStaticParams() {
  return [{ id: "new" }];
}

export default async function ChatAnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChatPageLayout analysisId={id} />;
}
