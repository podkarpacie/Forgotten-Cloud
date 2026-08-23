import { motion } from "framer-motion";
import {
  Boxes,
  Cpu,
  LayoutDashboard,
  Palette,
  Plus,
  Server as ServerIcon,
  Settings as SettingsIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { BrandHeader } from "./brand";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/create", label: "New server", icon: Plus },
  { href: "/engine", label: "Engine & versions", icon: Cpu },
  { href: "/plugins", label: "Plugins", icon: Boxes },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="relative min-h-screen">
      {/* Ambient animated blobs */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed -top-40 right-[-10%] h-[480px] w-[480px] rounded-full opacity-[0.16] blur-3xl"
        style={{ background: "radial-gradient(circle, var(--brand), transparent 65%)" }}
        animate={{ x: [0, -40, 0], y: [0, 30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none fixed bottom-[-20%] left-[-8%] h-[420px] w-[420px] rounded-full opacity-[0.13] blur-3xl"
        style={{ background: "radial-gradient(circle, var(--brand-3), transparent 65%)" }}
        animate={{ x: [0, 35, 0], y: [0, -25, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1500px]">
        {/* Sidebar */}
        <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r px-4 py-5 md:flex">
          <Link href="/">
            <BrandHeader />
          </Link>
          <nav className="mt-8 flex flex-col gap-1">
            {NAV.map((item) => {
              const active =
                item.href === "/" ? location === "/" : location.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <a className="group relative block">
                    <span
                      className={cn(
                        "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "text-primary"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="nav-active"
                          className="absolute inset-0 rounded-lg border border-transparent bg-secondary/70"
                          style={{
                            boxShadow:
                              "inset 0 0 0 1px color-mix(in oklab, var(--brand) 35%, transparent)",
                          }}
                          transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        />
                      )}
                      <item.icon className="relative z-10 h-4 w-4" />
                      <span className="relative z-10">{item.label}</span>
                    </span>
                  </a>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-2">
            <Link href="/settings">
              <a className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                <Palette className="h-4 w-4" /> Appearance & themes
              </a>
            </Link>
            <a
              href="#"
              onClick={(event) => event.preventDefault()}
              className="mono-label block px-3 pt-2 text-[9px]"
            >
              v2.0 · local edition
            </a>
          </div>
        </aside>

        {/* Mobile top bar */}
        <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b bg-background/85 px-4 py-3 backdrop-blur md:hidden">
          <Link href="/">
            <BrandHeader compact />
          </Link>
          <div className="flex gap-3">
            <Link href="/engine">
              <Cpu className="h-5 w-5 text-muted-foreground" />
            </Link>
            <Link href="/settings">
              <SettingsIcon className="h-5 w-5 text-muted-foreground" />
            </Link>
          </div>
        </div>

        <main className="min-h-screen flex-1 px-4 pb-16 pt-20 md:px-8 md:pt-8">{children}</main>
      </div>
    </div>
  );
}

export function StatusDot({ status }: { status: string }) {
  const color =
    status === "running"
      ? "bg-emerald-400"
      : status === "starting" || status === "stopping"
        ? "bg-amber-400"
        : status === "error"
          ? "bg-red-400"
          : "bg-zinc-500";
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cn("h-2 w-2 rounded-full", color, status === "running" && "status-live")}
      />
      <span className="mono-label">{status}</span>
    </span>
  );
}

export function PageHeading({
  title,
  subtitle,
  icon: Icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon?: typeof ServerIcon;
  actions?: ReactNode;
}) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mb-6 flex flex-wrap items-end justify-between gap-4"
    >
      <div className="flex items-center gap-3">
        {Icon && (
          <span className="brand-ring flex h-11 w-11 items-center justify-center rounded-xl bg-card">
            <Icon className="h-5 w-5 text-primary" />
          </span>
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </motion.header>
  );
}
