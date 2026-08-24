import { motion } from "framer-motion";
import {
  Clock,
  Cpu,
  HardDrive,
  Plus,
  Rocket,
  Server as ServerIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { PageHeading, StatusDot } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api";

interface OverviewResponse {
  servers: {
    id: string;
    name: string;
    profile: string;
    engineVersion: string;
    status: string;
    diskUsageBytes: number;
    createdAt: number;
  }[];
  runningCount: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

/** Smoothly counts a numeric value up/down when it changes. */
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const start = previous.current;
    const delta = value - start;
    if (delta === 0) return;
    previous.current = value;
    const duration = 420;
    const t0 = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const progress = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + delta * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{display}</>;
}

export default function Dashboard() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () =>
      apiGet<OverviewResponse>("/overview")
        .then(setOverview)
        .catch((cause) => setError(String(cause)));
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);

  const servers = overview?.servers ?? [];

  return (
    <div>
      <PageHeading
        title="Dashboard"
        subtitle="Your local fleet of Forgotten Engine worlds."
        actions={
          <Link href="/create">
            <Button size="sm">
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Create server
            </Button>
          </Link>
        }
      />

      {/* Stat strip */}
      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-4">
        <Stat label="worlds" icon={ServerIcon}>
          <AnimatedNumber value={servers.length} />
        </Stat>
        <Stat label="running" icon={Rocket} accent>
          <AnimatedNumber value={overview?.runningCount ?? 0} />
        </Stat>
        <Stat
          label="disk used"
          icon={HardDrive}
          value={
            formatBytes(servers.reduce((total, server) => total + server.diskUsageBytes, 0)) || "0 B"
          }
        />
        <Stat label="profiles" value="3" icon={Cpu} />
      </div>

      {error && (
        <div className="panel mb-6 border-destructive/40 p-4 text-sm text-destructive">{error}</div>
      )}

      {!overview ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(3)].map((_, index) => (
            <Skeleton key={index} className="h-36 rounded-lg" />
          ))}
        </div>
      ) : servers.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 p-14 text-center">
          <p className="text-[15px] font-medium">No worlds yet</p>
          <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            Create your first Forgotten Engine server — the panel provisions the world, allocates
            ports and installs the matching release automatically.
          </p>
          <Link href="/create" className="mt-2">
            <Button size="sm" variant="secondary">
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Create your first server
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {servers.map((server, index) => (
            <motion.div
              key={server.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.28, ease: "easeOut" }}
            >
              <Link href={`/servers/${server.id}`}>
                <a className="block h-full rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  <div className="panel hover-lift group h-full p-5 cursor-pointer">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-semibold leading-snug transition-colors group-hover:text-primary">
                          {server.name}
                        </h3>
                        <div className="label-meta mt-1 truncate">
                          {server.engineVersion} · {server.profile}
                        </div>
                      </div>
                      <StatusDot status={server.status} />
                    </div>
                    <div className="mt-5 flex items-center gap-4 border-t pt-3 text-[11px] text-muted-foreground">
                      <span>{formatBytes(server.diskUsageBytes)}</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(server.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </a>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      <p className="mt-8 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
        Forgotten Engine is under active development. Features it has not shipped yet appear as
        ready scaffolds here; the panel lights them up the moment upstream does.
      </p>
    </div>
  );
}

function Stat({
  label,
  icon: Icon,
  children,
  value,
  accent,
}: {
  label: string;
  icon: typeof Rocket;
  children?: React.ReactNode;
  value?: string;
  accent?: boolean;
}) {
  return (
    <div className="relative bg-card px-4 py-3.5">
      {accent && <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-primary/70" />}
      <div className="label-meta flex items-center gap-1.5">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-1 font-mono text-lg font-semibold tracking-tight tabular-nums">
        {children ?? value}
      </div>
    </div>
  );
}
