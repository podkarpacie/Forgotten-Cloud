import { Globe2, Rocket } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, apiSend } from "@/lib/api";
import type { ServerMeta } from "@/lib/types";

interface AacState {
  provisioned: boolean;
  roadmap: string[];
}

export default function AacTab({ meta }: { meta: ServerMeta }) {
  const [state, setState] = useState<AacState | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    apiGet<AacState>(`/servers/${meta.id}/aac`).then(setState).catch(() => undefined);
  }, [meta.id]);

  useEffect(refresh, [refresh]);

  async function provision() {
    setBusy(true);
    try {
      await apiSend(`/servers/${meta.id}/aac/provision`, "POST");
      toast.success("AAC workspace scaffolded at aac/");
      refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe2 className="h-5 w-5 text-primary" /> Forgotten AAC
            <Badge variant="secondary" className="font-mono text-[10px]">
              upcoming · MyAAC-style web panel
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Forgotten AAC will be the official account/character website for this world — a modern
            MyAAC-style experience reading the same SQLite database the engine writes. It is being
            built as its own project and has no public release yet; this workspace reserves its home.
          </p>

          <ol className="space-y-2 rounded-xl border border-dashed p-4">
            {state?.roadmap.map((line, index) => (
              <li key={index} className="flex gap-3 text-sm">
                <span className="label-meta pt-1">{String(index + 1).padStart(2, "0")}</span>
                <span className="text-muted-foreground">{line}</span>
              </li>
            ))}
          </ol>

          <div className="flex items-center justify-between gap-4 rounded-xl border bg-card/40 p-4">
            <div>
              <div className="text-sm font-semibold">Workspace</div>
              <p className="text-xs text-muted-foreground">
                {state?.provisioned
                  ? "Scaffolded — aac/README.md and aac.config.json are in place."
                  : "Reserve the aac/ folder now so the bundle can drop straight in later."}
              </p>
            </div>
            <Button onClick={() => void provision()} disabled={busy || Boolean(state?.provisioned)}>
              <Rocket className="mr-2 h-4 w-4" />
              {state?.provisioned ? "Reserved" : busy ? "Working…" : "Provision workspace"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

