import { motion } from "framer-motion";
import { Boxes, PackageOpen, Puzzle, ShieldQuestion } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiGet, apiSend } from "@/lib/api";

interface RegistryEntry {
  id: string;
  name: string;
  description: string;
  version: string;
  engineCompatibility: string[];
  status: "planned" | "available" | "coming-soon";
}

interface InstalledPlugin {
  dir: string;
  manifest: Record<string, unknown>;
  enabled: boolean;
  installedAt: number | null;
}

export default function PluginsTab({ id }: { id: string }) {
  const [registry, setRegistry] = useState<RegistryEntry[]>([]);
  const [installed, setInstalled] = useState<InstalledPlugin[]>([]);

  const refresh = useCallback(() => {
    apiGet<{ entries: RegistryEntry[] }>("/plugins/registry").then((body) => setRegistry(body.entries));
    apiGet<{ installed: InstalledPlugin[] }>(`/servers/${id}/plugins`).then((body) =>
      setInstalled(body.installed),
    );
  }, [id]);

  useEffect(refresh, [refresh]);

  async function install(entry: RegistryEntry) {
    try {
      await apiSend(`/servers/${id}/plugins/install`, "POST", { id: entry.id });
      toast.success(`Installed ${entry.name}`);
      refresh();
    } catch (cause) {
      toast.info(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function toggle(dir: string) {
    await apiSend(`/servers/${id}/plugins/${dir}/toggle`, "POST");
    refresh();
  }

  async function remove(dir: string) {
    if (!confirm(`Remove plugin folder “${dir}”?`)) return;
    await fetch(`/api/servers/${id}/plugins/${dir}`, { method: "DELETE", credentials: "same-origin" });
    refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardContent className="pt-5">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <Puzzle className="h-4 w-4 text-primary" /> Registry
          </h3>
          <p className="mb-4 text-xs text-muted-foreground">
            Curated packages for Forgotten Engine. Installation activates the moment the official
            plugin SDK ships — no fabricated stats, ever.
          </p>
          <div className="space-y-2">
            {registry.map((entry) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3 rounded-xl border bg-card/40 p-3"
              >
                <Boxes className="mt-0.5 h-5 w-5 shrink-0 text-primary/70" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{entry.name}</span>
                    <Badge variant="outline" className="font-mono text-[9px]">
                      v{entry.version}
                    </Badge>
                    {entry.status !== "available" && (
                      <Badge variant="secondary" className="font-mono text-[9px]">
                        awaiting SDK
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{entry.description}</p>
                </div>
                <Button size="sm" disabled={entry.status !== "available"} onClick={() => void install(entry)}>
                  Install
                </Button>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <PackageOpen className="h-4 w-4 text-primary" /> Installed on this world
          </h3>
          <p className="mb-4 text-xs text-muted-foreground">
            Lives under <code className="font-mono">data/plugins/&lt;plugin&gt;/manifest.json</code>.
            Drop a manifest there manually and it shows up here too.
          </p>
          {installed.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
              <ShieldQuestion className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nothing installed yet.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {installed.map((plugin) => (
                <li key={plugin.dir} className="flex items-center gap-3 rounded-xl border bg-card/40 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs">{plugin.dir}</div>
                    <div className="mono-label mt-0.5">
                      {(plugin.manifest.name as string) ?? "unnamed"}
                    </div>
                  </div>
                  <Badge variant={plugin.enabled ? "default" : "secondary"} className="font-mono text-[9px]">
                    {plugin.enabled ? "enabled" : "disabled"}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => void toggle(plugin.dir)}>
                    toggle
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void remove(plugin.dir)}>
                    remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
