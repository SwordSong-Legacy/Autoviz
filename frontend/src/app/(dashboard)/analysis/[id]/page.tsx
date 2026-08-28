import { AnalysisRedirect } from "./analysis-redirect";

export async function generateStaticParams() {
  return [{ id: "new" }];
}

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AnalysisRedirect id={id} />;
}
