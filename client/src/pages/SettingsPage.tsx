import { motion } from "framer-motion";
import { HeartHandshake, Moon, Network, Palette, Save, Settings2, Sun, Sunrise } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeading } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiGet, apiSend } from "@/lib/api";
import type { PanelSettings } from "@/lib/types";
import { useTheme, type ThemeAccent, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

const MODES: { id: ThemeMode; label: string; icon: typeof Sun; preview: string }[] = [
  { id: "dark", label: "Dark", icon: Moon, preview: "#232629" },
  { id: "light", label: "Light", icon: Sun, preview: "#f7f8f9" },
  { id: "midnight", label: "Midnight", icon: Sunrise, preview: "#1c2029" },
];

const ACCENTS: { id: ThemeAccent; label: string; color: string }[] = [
  { id: "graphite", label: "Graphite", color: "#8a94a2" },
  { id: "teal", label: "Teal", color: "#3d9db0" },
  { id: "plum", label: "Plum", color: "#9b6cc4" },
  { id: "amber", label: "Amber", color: "#d29a43" },
  { id: "crimson", label: "Crimson", color: "#cf5f5f" },
  { id: "moss", label: "Moss", color: "#7fae62" },
];

export default function SettingsPage() {
  const theme = useTheme();
  const [settings, setSettings] = useState<PanelSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<PanelSettings>("/settings").then(setSettings);
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      setSettings(await apiSend<PanelSettings>("/settings", "PUT", settings));
      toast.success("Panel settings saved");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof PanelSettings>(key: K, value: PanelSettings[K]) {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
  }

  return (
    <div className="space-y-6">
      <PageHeading
        title="Settings"
        subtitle="Appearance is remembered in a browser cookie — no accounts, fully local."
      />

      {/* Appearance */}
      <Card>
        <CardContent className="grid gap-8 pt-5 lg:grid-cols-2">
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Moon className="h-4 w-4 text-primary" /> Mode
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {MODES.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => theme.setMode(mode.id)}
                  className={cn(
                    "rounded-xl border p-3 text-center transition-all hover:border-transparent",
                    theme.mode === mode.id ? "border-primary/60 bg-accent" : "bg-card/40",
                  )}
                >
                  <span
                    className="mx-auto block h-10 w-full rounded-lg border"
                    style={{ background: mode.preview }}
                  />
                  <span className="label-meta mt-2 flex items-center justify-center gap-1.5">
                    <mode.icon className="h-3 w-3" /> {mode.label}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Palette className="h-4 w-4 text-primary" /> Accent
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {ACCENTS.map((accent) => (
                <button
                  key={accent.id}
                  onClick={() => theme.setAccent(accent.id)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border px-2 py-2.5 transition-all",
                    theme.accent === accent.id ? "border-primary bg-[var(--tint)]" : "bg-card/40 hover:border-[var(--tint-strong)]",
                  )}
                >
                  <span
                    className="h-5 w-full rounded-full border border-black/10"
                    style={{ background: accent.color }}
                  />
                  <span className="text-xs font-medium">{accent.label}</span>
                </button>
              ))}
            </div>
            <label className="label-meta mt-4 flex cursor-pointer items-center justify-between rounded-xl border bg-card/40 px-3 py-2.5">
              reduced motion (disable ambient animation)
              <Switch checked={!theme.motion} onCheckedChange={(checked) => theme.setMotion(!checked)} />
            </label>
          </section>
        </CardContent>
      </Card>

      {/* Engine source */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardContent className="space-y-4 pt-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Settings2 className="h-4 w-4 text-primary" /> Engine acquisition
            </h3>
            {!settings ? (
              <p className="text-sm text-muted-foreground">loading…</p>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>GitHub owner</Label>
                    <Input value={settings.repoOwner} onChange={(event) => update("repoOwner", event.target.value)} className="mt-1.5 font-mono" />
                  </div>
                  <div>
                    <Label>Repository</Label>
                    <Input value={settings.repoName} onChange={(event) => update("repoName", event.target.value)} className="mt-1.5 font-mono" />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Preferred install method</Label>
                    <Select value={settings.preferredMethod} onValueChange={(value) => update("preferredMethod", value as PanelSettings["preferredMethod"])}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto (release → build → local)</SelectItem>
                        <SelectItem value="release">Release assets only</SelectItem>
                        <SelectItem value="source">Build from source only</SelectItem>
                        <SelectItem value="local">Local binary copy only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Engine source checkout (optional)</Label>
                    <Input value={settings.engineSourcePath} placeholder="path to Forgotten-Engine repo with Cargo.toml" onChange={(event) => update("engineSourcePath", event.target.value)} className="mt-1.5 font-mono text-xs" />
                  </div>
                  <div>
                    <Label>GitHub token (private repos)</Label>
                    <Input
                      type="password"
                      value={settings.githubToken ?? ""}
                      placeholder="ghp_… or fine-grained PAT"
                      onChange={(event) => update("githubToken", event.target.value)}
                      className="mt-1.5 font-mono text-xs"
                    />
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      Required to download engine releases when the repository is private.
                      Fine-grained read-only Contents access is enough.
                    </p>
                  </div>
                </div>
                <div>
                  <Label>Local prebuilt binary (optional override)</Label>
                  <Input value={settings.localEngineBinary} placeholder="…\target\release\forgotten-engine.exe" onChange={(event) => update("localEngineBinary", event.target.value)} className="mt-1.5 font-mono text-xs" />
                </div>

                <div className="border-t pt-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Network className="h-4 w-4 text-primary" /> Network access
                  </h3>
                  <div className="mt-3 max-w-md">
                    <Label>Who can reach this panel</Label>
                    <Select value={settings.networkAccess} onValueChange={(value) => update("networkAccess", value as PanelSettings["networkAccess"])}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lan">This machine + local network</SelectItem>
                        <SelectItem value="loopback">This machine only (127.0.0.1)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      Applies to the panel and to game servers (they listen on all interfaces and
                      advertise this machine's LAN address). Takes effect the next time each server
                      starts. There is no login by design - share only with machines you trust.
                    </p>
                  </div>
                </div>

                <Button onClick={() => void save()} disabled={saving}>
                  <Save className="mr-2 h-4 w-4" /> Save settings
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* About & credits */}
      <AboutSection />
    </div>
  );
}

const CREDITS: { name: string; detail: string; href?: string }[] = [
  {
    name: "Forgotten Engine",
    detail: "The Rust server engine this panel controls — by podkarpacie & contributors.",
    href: "https://github.com/podkarpacie/Forgotten-Engine",
  },
  { name: "Forgotten Cloud", detail: "Local control plane, MIT licensed.", href: "https://github.com/podkarpacie/Forgotten-Cloud" },
  { name: "Exo 2", detail: "Interface typeface — Natanael Gama, SIL OFL." },
  { name: "JetBrains Mono", detail: "Console typeface — JetBrains, SIL OFL." },
  { name: "Open source stack", detail: "React · Vite · Tailwind CSS · Radix UI · Framer Motion · Express." },
];

function AboutSection() {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <CardContent className="space-y-5 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
            <img
              src="/brand/logo-horizontal.svg"
              alt="Forgotten Cloud logo"
              className="h-16 rounded-md border bg-[#14171b] dark:bg-transparent"
            />
            <div className="flex items-center gap-2">
              {[ "/brand/logo-mark.svg", "/brand/logo-stacked.svg", "/brand/app-icon.svg"].map((asset) => (
                <img
                  key={asset}
                  src={asset}
                  alt=""
                  className="h-11 rounded-md border bg-[#14171b] p-1.5"
                />
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <HeartHandshake className="h-4 w-4 text-primary" /> Credits
            </h3>
            <ul className="divide-y rounded-lg border">
              {CREDITS.map((credit) => (
                <li key={credit.name} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2">
                  {credit.href ? (
                    <a
                      href={credit.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[13px] font-medium underline-offset-4 hover:text-primary hover:underline"
                    >
                      {credit.name}
                    </a>
                  ) : (
                    <span className="text-[13px] font-medium">{credit.name}</span>
                  )}
                  <span className="text-xs text-muted-foreground">{credit.detail}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            Forgotten Cloud v2.2 · runs entirely on your machine · no telemetry, no accounts.
            Not affiliated with CipSoft; no official client assets are distributed. Engine capability
            grows with upstream releases — the panel keeps pace automatically.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}


