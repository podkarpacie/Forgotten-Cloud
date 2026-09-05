import { AnimatePresence, motion } from "framer-motion";
import { Boxes, Cpu, Gamepad2, LayoutDashboard, Palette, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { BrandHeader } from "./brand";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/create", label: "New server", icon: Plus },
  { href: "/clients", label: "Clients", icon: Gamepad2 },
  { href: "/engine", label: "Engine & versions", icon: Cpu },
  { href: "/plugins", label: "Plugins", icon: Boxes },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="relative min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px]">
        {/* Sidebar */}
        <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r bg-card/40 px-3 py-5 md:flex">
          <Link href="/" className="px-2">
            <BrandHeader />
          </Link>
          <nav className="mt-8 flex flex-col gap-0.5">
            {NAV.map((item) => {
              const active =
                item.href === "/" ? location === "/" : location.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <a
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors",
                      active
                        ? "nav-active"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-[15px] w-[15px]" />
                    {item.label}
                  </a>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-0.5">
            <Link href="/settings">
              <a
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors",
                  location.startsWith("/settings")
                    ? "nav-active"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <Palette className="h-[15px] w-[15px]" /> Appearance
              </a>
            </Link>
            <div className="label-meta px-3 pb-1 pt-3 text-[9px]">v2.2 · local edition · MIT</div>
          </div>
        </aside>

        {/* Mobile top bar */}
        <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b bg-background/90 px-4 py-3 backdrop-blur md:hidden">
          <Link href="/">
            <BrandHeader compact />
          </Link>
          <div className="flex gap-4 text-muted-foreground">
            <Link href="/engine">
              <Cpu className="h-5 w-5" />
            </Link>
            <Link href="/settings">
              <Palette className="h-5 w-5" />
            </Link>
          </div>
        </div>

        <main className="min-h-screen flex-1 px-4 pb-16 pt-20 md:px-10 md:pt-9">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

export function StatusDot({ status }: { status: string }) {
  const color =
    status === "running"
      ? "bg-[var(--success)]"
      : status === "starting" || status === "stopping"
        ? "bg-[var(--warning)]"
        : status === "error"
          ? "bg-destructive"
          : "bg-muted-foreground/50";
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cn("h-[7px] w-[7px] rounded-full", color, status === "running" && "status-live")}
      />
      <span className="label-meta">{status}</span>
    </span>
  );
}

export function PageHeading({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b pb-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
