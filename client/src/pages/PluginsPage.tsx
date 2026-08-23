import { motion } from "framer-motion";
import { Boxes, Puzzle } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeading } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { apiGet } from "@/lib/api";

interface RegistryEntry {
  id: string;
  name: string;
  description: string;
  version: string;
  engineCompatibility: string[];
  status: string;
}

export default function PluginsPage() {
  const [entries, setEntries] = useState<RegistryEntry[]>([]);

  useEffect(() => {
    apiGet<{ entries: RegistryEntry[] }>("/plugins/registry").then((body) => setEntries(body.entries));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeading
        title="Plugins"
        subtitle="The Forgotten Engine plugin SDK is on the roadmap. This registry lights up with real packages — and per-world one-click installs — the day it ships."
        icon={Boxes}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry, index) => (
          <motion.div key={entry.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}>
            <Card className="h-full transition-transform hover:-translate-y-0.5">
              <CardContent className="pt-5">
                <Puzzle className="h-6 w-6 text-primary" />
                <h3 className="mt-3 font-bold">{entry.name}</h3>
                <p className="mt-1 min-h-[60px] text-xs leading-relaxed text-muted-foreground">
                  {entry.description}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="font-mono text-[9px]">v{entry.version}</Badge>
                  {entry.engineCompatibility.map((compat) => (
                    <Badge key={compat} variant="secondary" className="font-mono text-[9px]">
                      {compat}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="border-dashed">
        <CardContent className="pt-5 text-sm text-muted-foreground">
          <strong className="text-foreground">For SDK authors:</strong> a plugin is a folder under{" "}
          <code className="font-mono">data/plugins/&lt;id&gt;/</code> containing a{" "}
          <code className="font-mono">manifest.json</code> (name, version, engineCompatibility,
          entry points). The panel detects it automatically and lets operators toggle it per world.
        </CardContent>
      </Card>
    </div>
  );
}
