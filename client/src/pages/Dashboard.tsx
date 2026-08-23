import { motion } from "framer-motion";
import {
  Activity,
  CircleDot,
  Clock,
  Cpu,
  Database,
  HardDrive,
  Plus,
  Rocket,
  Server as ServerIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { PageHeading, StatusDot } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api";
import type { ProfileInfo, ServerSummary } from "@/lib/types";

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

export default function Dashboard() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    apiGet<OverviewResponse>("/overview")
      .then(setOverview)
      .catch((cause) => setError(String(cause)));
  }, []);

  useEffect(() => {
    refresh();
    apiGet<{ profiles: ProfileInfo[] }>("/profiles").then((body) => setProfiles(body.profiles));
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  const servers = overview?.servers ?? [];

  return (
    <div>
      <PageHeading
        title="Dashboard"
        subtitle="Your local fleet of Forgotten Engine worlds."
        icon={Activity}
        actions={
          <Link href="/create">
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Create server
            </Button>
          </Link>
        }
      />

      {/* Hero banner */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel relative mb-6 overflow-hidden rounded-2xl p-6 md:p-8"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--brand), transparent 60%)" }}
        />
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div>
            <div className="mono-label">forgotten cloud · local edition</div>
            <h2 className="mt-1 text-2xl font-extrabold md:text-3xl">
              Spin up a <span className="gradient-text">Forgotten Engine</span> world in seconds.
            </h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Pick a compatibility profile and an upstream release — the panel provisions the world,
              wires the ports, downloads or builds the right binary, and hands you a console.
            </p>
          </div>
          <div className="ml-auto grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatChip icon={ServerIcon} label="worlds" value={servers.length} />
            <StatChip icon={Rocket} label="running" value={overview?.runningCount ?? 0} highlight />
            <StatChip icon={Cpu} label="profiles" value={profiles.length || "…"} />
            <StatChip
              icon={HardDrive}
              label="disk"
              value={formatBytes(servers.reduce((total, server) => total + server.diskUsageBytes, 0))}
            />
          </div>
        </div>
      </motion.section>

      {error && (
        <Card className="mb-6 border-destructive/40">
          <CardContent className="pt-5 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* Server grid */}
      {!overview ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(3)].map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : servers.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel flex flex-col items-center gap-3 rounded-2xl p-12 text-center"
        >
          <CircleDot className="h-8 w-8 text-muted-foreground" />
          <h3 className="text-lg font-semibold">No worlds yet</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Create your first Forgotten Engine server. The panel will fetch the matching release for
            you automatically.
          </p>
          <Link href="/create" className="mt-2">
            <Button size="lg">
              <Plus className="mr-2 h-4 w-4" /> Create your first server
            </Button>
          </Link>
        </motion.div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {servers.map((server, index) => (
            <motion.div
              key={server.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.35 }}
            >
              <Link href={`/servers/${server.id}`}>
                <a className="block h-full">
                  <Card className="group h-full transition-all hover:-translate-y-0.5 hover:border-transparent hover:shadow-[0_20px_50px_-30px_rgba(0,0,0,0.6)]">
                    <CardContent className="flex h-full flex-col gap-3 pt-5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-lg font-bold leading-tight group-hover:text-primary">
                            {server.name}
                          </h3>
                          <div className="mono-label mt-1">
                            {server.engineVersion} · {server.profile}
                          </div>
                        </div>
                        <StatusDot status={server.status} />
                      </div>
                      <div className="mt-auto flex items-center gap-3 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          :{findGamePortHint(server)}
                        </Badge>
                        <span className="inline-flex items-center gap-1">
                          <HardDrive className="h-3 w-3" /> {formatBytes(server.diskUsageBytes)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />{" "}
                          {new Date(server.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </a>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {/* Engine capability note */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-8 flex items-start gap-2 rounded-xl border border-dashed p-4 text-xs leading-relaxed text-muted-foreground"
      >
        <Database className="mt-0.5 h-4 w-4 shrink-0" />
        Forgotten Engine is under active development (~48% complete). Features it has not shipped yet
        (full Lua scripting, official-client sessions) appear as ready scaffolds here — the panel is
        built to light them up the moment the engine does.
      </motion.p>
    </div>
  );
}

function findGamePortHint(server: ServerSummary | { id: string }): number | string {
  return (server as unknown as { ports?: { game: number } }).ports?.game ?? "•••••";
}

function StatChip({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: typeof Rocket;
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 ${
        highlight ? "brand-ring bg-card" : "bg-card/60"
      }`}
    >
      <div className="mono-label flex items-center gap-1.5">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-0.5 font-mono text-xl font-bold">{value}</div>
    </div>
  );
}
