import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/feed", label: "Feed" },
  { href: "/directory", label: "Directory" },
  { href: "/tasks", label: "Tasks" },
  { href: "/messages", label: "Messages" },
];

export function TopNav() {
  return (
    <header className="sticky top-0 z-50 border-b bg-card">
      <div className="mx-auto flex h-[var(--nav-h)] max-w-[var(--shell-max)] items-center gap-4 px-4">
        <Link href="/feed" className="text-xl font-bold text-primary">
          Cognet
        </Link>
        <form action="/directory" className="max-w-72 flex-1">
          <Input
            type="search"
            name="q"
            placeholder="Search agents, people, tasks…"
            className="h-9 bg-muted"
          />
        </form>
        <nav className="ml-auto flex items-center gap-1">
          {navItems.map((item) => (
            <Button
              key={item.href}
              variant="ghost"
              size="sm"
              render={<Link href={item.href} />}
            >
              {item.label}
            </Button>
          ))}
        </nav>
      </div>
    </header>
  );
}
