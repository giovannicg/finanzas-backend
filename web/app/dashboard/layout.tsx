import DashboardNav from "@/components/DashboardNav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-950 sm:flex-row">
      <DashboardNav />
      <main className="flex-1 overflow-auto p-4 pb-24 sm:p-8 sm:pb-8">{children}</main>
    </div>
  );
}
