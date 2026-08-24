import { motion } from "framer-motion";
import { Activity, Clock, HardDrive, KeyRound, Map, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { apiGet, apiSend } from "@/lib/api";
import type { RuntimeSnapshot, ServerMeta } from "@/lib/types";

interface Props {
  meta: ServerMeta;
  runtime: RuntimeSnapshot;
  onChanged: () => void;
}

interface ToolResult {
  code: number;
  output: string;
}

export default function OverviewTab({ meta, runtime, onChanged }: Props) {
  const [toolBusy, setToolBusy] = useState<string | null>(null);
  const [toolOutput, setToolOutput] = useState<Record<string, ToolResult>>({});

  useEffect(() => {
    if (runtime.status !== "running") onChanged();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime.status]);

  async function runTool(tool: string) {
    setToolBusy(tool);
    try {
      const result = await apiSend<ToolResult>(`/servers/${meta.id}/tools/${tool}`, "POST");
      setToolOutput((current) => ({ ...current, [tool]: result }));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setToolBusy(null);
    }
  }

  const ports: [string, number | null | undefined][] = [
    ["status", meta.ports.status],
    ["game", meta.ports.game],
    ["session", meta.ports.session],
    ["otc login", meta.ports.otcLogin],
    ["otc game", meta.ports.otcGame],
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4 text-primary" /> Runtime
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 font-mono text-sm">
          <Row label="status" value={runtime.status} />
          <Row label="pid" value={runtime.pid ?? "—"} />
          <Row
            label="uptime"
            value={
              runtime.uptimeMs > 0 ? formatUptime(runtime.uptimeMs) : "—"
            }
          />
          <div>
            {ports.map(([label, port]) => (
              <Row key={label} label={`port ${label}`} value={port ?? "disabled"} />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <HardDrive className="h-4 w-4 text-primary" /> World
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 font-mono text-sm">
          <Row label="template" value={meta.template} />
          <Row label="profile" value={meta.profile} />
          <Row label="engine" value={meta.engineVersion} />
          <Row
            label="created"
            value={new Date(meta.createdAt).toLocaleDateString()}
          />
          <Row
            label="autobackup"
            value={meta.autoBackup.enabled ? `every ${meta.autoBackup.intervalHours}h` : "off"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-primary" /> Engine tools
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <ToolButton icon={ShieldCheck} label="validate" busy={toolBusy === "validate"} onClick={() => runTool("validate")} />
          <ToolButton icon={Map} label="tfs-audit" busy={toolBusy === "tfs-audit"} onClick={() => runTool("tfs-audit")} />
          <ToolButton icon={RefreshCw} label="compatibility" busy={toolBusy === "compatibility"} onClick={() => runTool("compatibility")} />
          <ToolButton icon={KeyRound} label="generate-key" busy={toolBusy === "generate-key"} onClick={() => runTool("generate-key")} />
          {Object.entries(toolOutput).map(([tool, result]) => (
            <motion.pre
              key={tool}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-full max-h-56 overflow-auto rounded-lg border bg-background/60 p-3 font-mono text-[11px] leading-relaxed"
            >
              {`${tool} → exit ${result.code}\n\n${result.output}`}
            </motion.pre>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed py-1 last:border-none">
      <span className="label-meta">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ToolButton({
  icon: Icon,
  label,
  busy,
  onClick,
}: {
  icon: typeof ShieldCheck;
  label: string;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex items-center gap-2 rounded-lg border bg-card/50 px-3 py-2 text-xs font-medium transition-all hover:border-transparent hover:bg-card disabled:opacity-50"
    >
      {busy ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <Icon className="h-3.5 w-3.5 text-primary" />
      )}
      <span className="font-mono">{label}</span>
    </button>
  );
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

