import { motion } from "framer-motion";
import {
  Archive,
  Boxes,
  Cog,
  FolderTree,
  Gauge,
  Globe2,
  ScrollText,
  Square,
  TerminalSquare,
  Trash2,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { PageHeading, StatusDot } from "@/components/layout";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { apiGet, apiSend } from "@/lib/api";
import type { RuntimeSnapshot, ServerMeta } from "@/lib/types";
import { cn } from "@/lib/utils";
import AacTab from "./server/AacTab";
import BackupsTab from "./server/BackupsTab";
import ConfigTab from "./server/ConfigTab";
import ConsoleTab from "./server/ConsoleTab";
import DatabaseTab from "./server/DatabaseTab";
import FilesTab from "./server/FilesTab";
import OverviewTab from "./server/OverviewTab";
import PluginsTab from "./server/PluginsTab";

const TABS = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "console", label: "Console", icon: TerminalSquare },
  { id: "files", label: "Files", icon: FolderTree },
  { id: "config", label: "Config", icon: Cog },
  { id: "database", label: "Database", icon: Users },
  { id: "backups", label: "Backups", icon: Archive },
  { id: "plugins", label: "Plugins", icon: Boxes },
  { id: "aac", label: "AAC", icon: Globe2 },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function ServerDetail() {
  const params = useParams<{ id: string; tab?: string }>();
  const [, navigate] = useLocation();
  const [meta, setMeta] = useState<ServerMeta | null>(null);
  const [runtime, setRuntime] = useState<RuntimeSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [engineInstalled, setEngineInstalled] = useState(true);

  const refresh = useCallback(() => {
    apiGet<{ meta: ServerMeta; runtime: RuntimeSnapshot; engineInstalled: boolean }>(
      `/servers/${params.id}`,
    )
      .then((body) => {
        setMeta(body.meta);
        setRuntime(body.runtime);
        setEngineInstalled(body.engineInstalled);
      })
      .catch((cause) => toast.error(cause instanceof Error ? cause.message : String(cause)));
  }, [params.id]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function lifecycle(action: "start" | "stop" | "restart") {
    setBusy(true);
    try {
      await apiSend(`/servers/${params.id}/${action}`, "POST");
      toast.success(`Server ${action === "stop" ? "stopped" : action === "restart" ? "restarted" : "started"}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
      setTimeout(refresh, 800);
    }
  }

  async function destroy() {
    try {
      await apiSend(`/servers/${params.id}`, "DELETE");
      toast.success("Server deleted");
      navigate("/");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    }
  }

  if (!meta || !runtime) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-2/3 rounded-xl" />
        <Skeleton className="h-[420px] rounded-2xl" />
      </div>
    );
  }

  const activeTab: TabId = (
    TABS.some((tab) => tab.id === params.tab) ? params.tab : "overview"
  ) as TabId;

  const running = runtime.status === "running";

  return (
    <div>
      <PageHeading
        title={meta.name}
        subtitle={`${meta.profile} · ${meta.engineVersion}${engineInstalled ? "" : " · binary not installed yet"}`}
        actions={
          <>
            <StatusDot status={runtime.status} />
            <Button size="sm" disabled={busy || running} onClick={() => lifecycle("start")}>
              Start
            </Button>
            <Button size="sm" variant="secondary" disabled={busy || !running} onClick={() => lifecycle("stop")}>
              <Square className="mr-1.5 h-3.5 w-3.5" /> Stop
            </Button>
            <Button size="sm" variant="secondary" disabled={busy || !running} onClick={() => lifecycle("restart")}>
              Restart
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete “{meta.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently removes the world directory, its database and all panel backups
                    for this server.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction onClick={destroy}>Delete forever</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        }
      />

      {/* Tab rail */}
      <div className="mb-5 flex flex-wrap gap-1 border-b pb-px">
        {TABS.map((tab) => (
          <Link key={tab.id} href={`/servers/${meta.id}/${tab.id}`}>
            <a className="relative block">
              <span
                className={cn(
                  "flex items-center gap-2 rounded-t-lg px-3.5 py-2 text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
                {activeTab === tab.id && (
                  <motion.span
                    layoutId={`tab-underline-${meta.id}`}
                    className="absolute inset-x-3 -bottom-px h-0.5 bg-primary"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
              </span>
            </a>
          </Link>
        ))}
      </div>

      <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {activeTab === "overview" && (
          <OverviewTab meta={meta} runtime={runtime} onChanged={refresh} />
        )}
        {activeTab === "console" && <ConsoleTab id={meta.id} />}
        {activeTab === "files" && <FilesTab id={meta.id} />}
        {activeTab === "config" && <ConfigTab id={meta.id} />}
        {activeTab === "database" && <DatabaseTab id={meta.id} />}
        {activeTab === "backups" && <BackupsTab id={meta.id} />}
        {activeTab === "plugins" && <PluginsTab id={meta.id} />}
        {activeTab === "aac" && <AacTab meta={meta} />}
      </motion.div>

      <p className="mt-10 flex items-center gap-2 text-xs text-muted-foreground">
        <ScrollText className="h-3.5 w-3.5" />
        Run logs persist under <code className="font-mono">.fc/logs/</code> inside the world
        directory — also reachable through the Files tab by typing a path manually.
      </p>
    </div>
  );
}



