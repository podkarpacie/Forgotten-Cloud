import { motion } from "framer-motion";
import { Archive, Clock3, DownloadCloud, History, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiGet, apiSend, apiUpload } from "@/lib/api";
import type { BackupEntry } from "@/lib/types";

interface BackupsResponse {
  backups: BackupEntry[];
  autoBackup: { enabled: boolean; intervalHours: number; keep: number };
}

export default function BackupsTab({ id }: { id: string }) {
  const [data, setData] = useState<BackupsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    apiGet<BackupsResponse>(`/servers/${id}/backups`)
      .then(setData)
      .catch((cause) => toast.error(cause instanceof Error ? cause.message : String(cause)));
  }, [id]);

  useEffect(refresh, [refresh]);

  async function create(force = false) {
    setBusy(true);
    try {
      await apiSend(`/servers/${id}/backups/create`, "POST", force ? { force: true } : {});
      toast.success("Backup created");
      refresh();
    } catch (cause) {
      if (String(cause).includes("stop the server")) {
        if (confirm("Server is running. Snapshot the live world anyway?")) return create(true);
      } else {
        toast.error(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      setBusy(false);
    }
  }

  async function restore(file: string) {
    if (!confirm(`Restore ${file}? Current world files are replaced (a pre-restore snapshot is kept).`)) return;
    try {
      await apiSend(`/servers/${id}/backups/restore`, "POST", { file });
      toast.success("Restored");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function remove(file: string) {
    if (!confirm(`Delete backup ${file}?`)) return;
    await apiSend(`/servers/${id}/backups/${encodeURIComponent(file)}`, "DELETE");
    refresh();
  }

  async function updateAuto(patch: Partial<BackupsResponse["autoBackup"]>) {
    const next = { ...data!.autoBackup, ...patch };
    await apiSend(`/servers/${id}/autobackup`, "PUT", next);
    refresh();
  }

  async function exportServer() {
    window.location.href = `/api/servers/${id}/export`;
  }

  async function importZip(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      await apiUpload(`/import?name=${encodeURIComponent(`${file.name.replace(/\.zip$/i, "")} copy`)}`, await file.arrayBuffer());
      toast.success(`Imported “${file.name}” as a new server`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    }
  }

  void remove;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardContent className="pt-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <History className="h-4 w-4 text-primary" /> Snapshot history
            </h3>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void create()} disabled={busy}>
                <Archive className="mr-1.5 h-3.5 w-3.5" /> New backup
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void exportServer()}>
                <DownloadCloud className="mr-1.5 h-3.5 w-3.5" /> Export full server
              </Button>
              <Button size="sm" variant="secondary" onClick={() => importRef.current?.click()}>
                <Upload className="mr-1.5 h-3.5 w-3.5" /> Import zip
              </Button>
              <input ref={importRef} type="file" accept=".zip" hidden onChange={(event) => void importZip(event.target.files)} />
            </div>
          </div>

          {!data || data.backups.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No backups yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.backups.map((backup, index) => (
                <motion.li
                  key={backup.file}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  className="group flex items-center gap-3 rounded-xl border bg-card/40 px-3 py-2"
                >
                  <Archive className="h-4 w-4 shrink-0 text-primary/70" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs">{backup.file}</div>
                    <div className="label-meta mt-0.5 flex items-center gap-2">
                      {(backup.size / 1024).toFixed(0)} KB ·{" "}
                      {new Date(backup.createdAt).toLocaleString()}
                    </div>
                  </div>
                  {backup.origin !== "manual" && (
                    <Badge variant="outline" className="shrink-0 font-mono text-[9px]">
                      {backup.origin}
                    </Badge>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => void restore(backup.file)}>
                    Restore
                  </Button>
                  <a href={`/api/servers/${id}/file?path=.fc/backups/${encodeURIComponent(backup.file)}&download=1`}>
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="download backup">
                      <DownloadCloud className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    title="delete backup"
                    onClick={() => void remove(backup.file)}
                  >
                    <Trash2 className="h-3.5 w-3.5 hover:text-destructive" />
                  </Button>
                </motion.li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="self-start">
        <CardContent className="space-y-4 pt-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Clock3 className="h-4 w-4 text-primary" /> Automatic backups
          </h3>
          {data && (
            <>
              <label className="label-meta flex items-center justify-between">
                enabled
                <Switch
                  checked={data.autoBackup.enabled}
                  onCheckedChange={(enabled) => void updateAuto({ enabled })}
                />
              </label>
              <div>
                <Label htmlFor="interval">Interval (hours)</Label>
                <Input
                  id="interval"
                  type="number"
                  min={1}
                  max={168}
                  value={data.autoBackup.intervalHours}
                  disabled={!data.autoBackup.enabled}
                  onChange={(event) => void updateAuto({ intervalHours: Number(event.target.value || 6) })}
                />
              </div>
              <div>
                <Label htmlFor="keep">Keep last</Label>
                <Input
                  id="keep"
                  type="number"
                  min={1}
                  max={100}
                  value={data.autoBackup.keep}
                  onChange={(event) => void updateAuto({ keep: Number(event.target.value || 10) })}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Runs while this panel stays open. Snapshots exclude run logs and panel metadata.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

