import { motion } from "framer-motion";
import { Gamepad2, Package, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeading } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet, apiSend, apiUpload } from "@/lib/api";

interface AssetSlot {
  protocol: number;
  kind: "spr" | "dat";
  present: boolean;
  size: number;
  updatedAt: number | null;
}

interface ClientBuild {
  id: string;
  label: string;
  fork: string;
  protocols: number[];
  exeName: string | null;
  createdAt: number;
}

interface WorldSummary {
  id: string;
  name: string;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export default function ClientsPage() {
  const [slots, setSlots] = useState<AssetSlot[]>([]);
  const [builds, setBuilds] = useState<ClientBuild[]>([]);
  const [worlds, setWorlds] = useState<WorldSummary[]>([]);
  const [selectedWorld, setSelectedWorld] = useState("");
  const [selectedBuild, setSelectedBuild] = useState("");
  const [packageHost, setPackageHost] = useState("127.0.0.1");
  const [packaging, setPackaging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const assetInputRef = useRef<HTMLInputElement>(null);
  const buildInputRef = useRef<HTMLInputElement>(null);
  const pendingAsset = useRef<{ protocol: number; kind: "spr" | "dat" } | null>(null);
  const [buildLabel, setBuildLabel] = useState("");
  const [buildProtocols, setBuildProtocols] = useState("740");

  const refresh = () => {
    apiGet<{ slots: AssetSlot[] }>("/clients/slots").then((body) => setSlots(body.slots));
    apiGet<{ builds: ClientBuild[] }>("/clients/builds").then((body) => setBuilds(body.builds));
    apiGet<{ servers: WorldSummary[] }>("/servers").then((body) => {
      setWorlds(body.servers.map((server) => ({ id: server.id, name: server.name })));
    });
  };

  useEffect(refresh, []);

  const uploadSlot = async (file: File, protocol: number, kind: "spr" | "dat") => {
    setUploading(true);
    try {
      await apiUpload(`/clients/slots/${protocol}/${kind}`, await file.arrayBuffer());
      toast.success(`Protocol ${protocol} ${kind.toUpperCase()} slot updated`);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
    }
  };

  const uploadBuild = async (file: File) => {
    const protocols = buildProtocols
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0);
    if (protocols.length === 0) {
      toast.error("Enter at least one protocol version (e.g. 740)");
      return;
    }
    setUploading(true);
    try {
      const query = `?fork=forgotten-client&label=${encodeURIComponent(buildLabel)}&protocols=${protocols.join(",")}`;
      const response = await fetch(`/api/clients/builds${query}`, {
        method: "POST",
        credentials: "same-origin",
        body: await file.arrayBuffer(),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `${response.status} ${response.statusText}`);
      }
      toast.success("Client build registered");
      setBuildLabel("");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
    }
  };

  const downloadPackage = async () => {
    if (!selectedWorld || !selectedBuild) {
      toast.error("Pick a world and a client build first");
      return;
    }
    setPackaging(true);
    try {
      const response = await fetch(`/api/clients/package/${selectedWorld}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildId: selectedBuild, host: packageHost }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `${response.status} ${response.statusText}`);
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = match?.[1] ?? "client-package.zip";
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Client package downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setPackaging(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeading
        title="Clients"
        subtitle="Package downloadable game clients for your worlds. The panel never bundles Tibia assets - upload your own lawful .spr/.dat per protocol, register packaged client builds, and download a ready-to-run zip per world."
      />

      {/* Protocol asset slots */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-2">
            <Gamepad2 className="h-5 w-5 text-primary" />
            <h3 className="font-bold">Protocol asset slots</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            One upload per protocol, reused by every world package. An empty slot means packaged
            clients ship asset-free.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[...new Set(slots.map((slot) => slot.protocol))].map((protocol, index) => (
              <motion.div key={protocol} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
                <Card className="h-full">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-bold">protocol {protocol}</span>
                      <Badge variant={slots.filter((slot) => slot.protocol === protocol).every((slot) => slot.present) ? "default" : "outline"} className="text-[9px]">
                        {slots.filter((slot) => slot.protocol === protocol).every((slot) => slot.present) ? "ready" : "partial"}
                      </Badge>
                    </div>
                    <div className="mt-3 space-y-2">
                      {(["spr", "dat"] as const).map((kind) => {
                        const slot = slots.find((entry) => entry.protocol === protocol && entry.kind === kind);
                        return (
                          <div key={kind} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs">
                            <span className="font-mono">{slot?.present ? `${kind.toUpperCase()} · ${formatBytes(slot.size)}` : `${kind.toUpperCase()} · empty`}</span>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2"
                                disabled={uploading}
                                onClick={() => {
                                  pendingAsset.current = { protocol, kind };
                                  assetInputRef.current?.click();
                                }}
                              >
                                <Upload className="h-3.5 w-3.5" />
                              </Button>
                              {slot?.present ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-destructive"
                                  onClick={async () => {
                                    await apiSend(`/clients/slots/${protocol}/${kind}`, "DELETE");
                                    refresh();
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Client builds */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <h3 className="font-bold">Client builds</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload a packaged client zip (executable, init.lua, modules/ and data/ at the zip root,
            as produced by the fork's own packaging script). Declare the protocol versions it supports.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              className="w-52"
              placeholder="Build label"
              value={buildLabel}
              onChange={(event) => setBuildLabel(event.target.value)}
            />
            <Input
              className="w-28"
              placeholder="Protocols (740,760)"
              value={buildProtocols}
              onChange={(event) => setBuildProtocols(event.target.value)}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={uploading}
              onClick={() => buildInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" /> Upload build zip
            </Button>
          </div>
          <div className="mt-4 space-y-2">
            {builds.length === 0 ? (
              <p className="text-xs text-muted-foreground">No client builds registered yet.</p>
            ) : (
              builds.map((build) => (
                <div key={build.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold">{build.label}</span>
                    <Badge variant="outline" className="font-mono text-[9px]">{build.fork}</Badge>
                    {build.protocols.map((protocol) => (
                      <Badge key={protocol} variant="secondary" className="font-mono text-[9px]">{protocol}</Badge>
                    ))}
                    {build.exeName ? null : (
                      <Badge variant="outline" className="text-[9px] text-destructive">no exe found</Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-destructive"
                    onClick={async () => {
                      await apiSend(`/clients/builds/${build.id}`, "DELETE");
                      refresh();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Package a world */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="font-bold">Package a world</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Resolves the world's protocol from its config.lua, pairs a client build with that
            protocol's asset slot, writes the connection files, and hands you a zip.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              className="h-9 rounded-md border bg-background px-3 text-xs"
              value={selectedWorld}
              onChange={(event) => setSelectedWorld(event.target.value)}
            >
              <option value="">Select world…</option>
              {worlds.map((world) => (
                <option key={world.id} value={world.id}>{world.name}</option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border bg-background px-3 text-xs"
              value={selectedBuild}
              onChange={(event) => setSelectedBuild(event.target.value)}
            >
              <option value="">Select client build…</option>
              {builds.map((build) => (
                <option key={build.id} value={build.id}>{build.label}</option>
              ))}
            </select>
            <Input
              className="w-36"
              placeholder="Host"
              value={packageHost}
              onChange={(event) => setPackageHost(event.target.value)}
            />
            <Button size="sm" disabled={packaging} onClick={() => void downloadPackage()}>
              <Package className="h-3.5 w-3.5" /> Download package
            </Button>
          </div>
        </CardContent>
      </Card>

      <input
        ref={assetInputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const pending = pendingAsset.current;
          if (file && pending) void uploadSlot(file, pending.protocol, pending.kind);
          event.target.value = "";
        }}
      />
      <input
        ref={buildInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadBuild(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}
