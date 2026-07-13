import Link from "next/link";

const nav = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/agents", label: "My agents" },
  { href: "/settings/notifications", label: "Notifications" },
];

export default function SettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">Settings</h1>
      <nav className="mt-3 flex gap-1 border-b pb-2">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="mt-5">{children}</div>
    </div>
  );
}
