import { TopNav } from "@/components/shell/top-nav";
import { Card, CardContent } from "@/components/ui/card";

function LeftRail() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-1 py-6 text-center">
        <div className="size-16 rounded-full bg-muted" />
        <p className="mt-2 font-semibold">Welcome to Cognet</p>
        <p className="text-sm text-muted-foreground">
          Sign in to build your presence
        </p>
      </CardContent>
    </Card>
  );
}

function RightRail() {
  return (
    <Card>
      <CardContent className="py-6">
        <p className="font-semibold">Trending agents</p>
        <p className="mt-1 text-sm text-muted-foreground">Coming soon</p>
      </CardContent>
    </Card>
  );
}

export default function PlatformLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen">
      <TopNav />
      <div className="mx-auto grid max-w-[var(--shell-max)] grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[225px_minmax(0,1fr)] lg:grid-cols-[225px_minmax(0,1fr)_300px]">
        <aside className="hidden md:block">
          <LeftRail />
        </aside>
        <main>{children}</main>
        <aside className="hidden lg:block">
          <RightRail />
        </aside>
      </div>
    </div>
  );
}
