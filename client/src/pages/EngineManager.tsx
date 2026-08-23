import { motion } from "framer-motion";
import { CheckCircle2, Cpu, Download, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeading } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiGet, apiSend } from "@/lib/api";
import type { EngineJob, ProfileInfo, VersionCatalog } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function EngineManager() {
  const [catalog, setCatalog] = useState<VersionCatalog | null>(null);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [jobs, setJobs] = useState<EngineJob[]>([]);
  const [busyVersion, setBusyVersion] = useState<string | null>(null);

  const refresh = useCallback(() => {
    apiGet<VersionCatalog>("/versions")
      .then(setCatalog)
      .catch((cause) => toast.error(cause instanceof Error ? cause.message : String(cause)));
    apiGet<{ jobs: EngineJob[] }>("/jobs").then((body) => setJobs(body.jobs));
  }, []);

  useEffect(() => {
    refresh();
    apiGet<{ profiles: ProfileInfo[] }>("/profiles").then((body) => setProfiles(body.profiles));
    const timer = setInterval(() => {
      apiGet<{ jobs: EngineJob[] }>("/jobs").then((body) => {
        setJobs(body.jobs);
        if (body.jobs.some((job) => job.status === "running" || job.status === "queued")) {
          setTimeout(refresh, 2500);
        }
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function install(tag: string) {
    setBusyVersion(tag);
    try {
      await apiSend("/install", "POST", { version: tag });
      toast.info(`Install queued for ${tag}`);
      refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyVersion(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeading
        title="Engine & versions"
        subtitle="Forgotten Engine releases from the upstream repository — install once, reuse across worlds."
        actions={
          <Button variant="secondary" onClick={refresh}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        {profiles.map((profile) => (
          <motion.div key={profile.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="h-full">
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold">{profile.id}</span>
                  {profile.experimental && (
                    <Badge variant="outline" className="font-mono text-[9px]">
                      experimental
                    </Badge>
                  )}
                </div>
                <div className="label-meta mt-1">{profile.reference} · protocol {profile.protocol}</div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{profile.blurb}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Active jobs */}
      {jobs.filter((job) => job.status === "running" || job.status === "queued" || job.status === "failed").length > 0 && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            {jobs.slice(0, 4).map((job) => (
              <div key={job.id} className="rounded-xl border p-3">
                <div className="flex items-center gap-2">
                  {job.status === "running" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : job.status === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : job.status === "failed" ? (
                    <XCircle className="h-4 w-4 text-red-400" />
                  ) : (
                    <Download className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="font-mono text-xs font-bold">
                    {job.kind} {job.version}
                  </span>
                  <span className="label-meta ml-auto">{job.status}</span>
                </div>
                <div className="console-scroll mt-2 max-h-40 space-y-0.5 overflow-auto font-mono text-[11px] text-muted-foreground">
                  {job.steps.map((step, index) => (
                    <p key={index}>· {step.message}</p>
                  ))}
                  {job.result?.error && <p className="text-red-400">{job.result.error}</p>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Releases</h3>
            {catalog && (
              <span className="label-meta">
                source: {catalog.source}
                {catalog.source === "github" && " · live"}
              </span>
            )}
          </div>
          {!catalog ? (
            <p className="text-sm text-muted-foreground">fetching tags…</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {catalog.versions.map((version) => (
                <li
                  key={version.tag}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border bg-card/40 px-3 py-2 transition-all",
                    version.installed ? "border-primary/60" : "",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold">
                    {version.tag}
                  </span>
                  {version.installed ? (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> installed
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyVersion === version.tag}
                      onClick={() => void install(version.tag)}
                    >
                      <Download className="mr-1 h-3 w-3" />
                      install
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


