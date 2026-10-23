import Link from "next/link";

// Dev index of the four surfaces (plan §1). Replaced by a marketing/landing page later.
const surfaces = [
  { href: "/owner", label: "Owner", hint: "Dashboard, menu, floor, staff, billing" },
  { href: "/staff", label: "Staff", hint: "PIN login, tables, orders, kitchen, bell" },
  { href: "/t/demo", label: "Customer", hint: "QR menu, cart, call staff, bill" },
  { href: "/admin", label: "Platform Admin", hint: "Organizations, plans, support" },
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] leading-tight font-bold" translate="no">
          RestoOS
        </h1>
        <p className="text-base text-body">Development index. Pick a surface.</p>
      </div>
      <nav aria-label="Surfaces">
        <ul className="flex flex-col gap-2">
          {surfaces.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="flex min-h-touch-hero flex-col justify-center gap-0.5 rounded-md border border-border px-4 py-3 transition-[border-color,background-color] duration-150 hover:border-foreground hover:bg-muted motion-reduce:transition-none"
              >
                <span className="text-base font-semibold">{s.label}</span>
                <span className="text-sm text-muted-foreground">{s.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
