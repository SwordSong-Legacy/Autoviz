import { Header } from "@/components/layout";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-auto p-3 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
