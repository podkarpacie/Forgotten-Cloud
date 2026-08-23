import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Loader2, Rocket, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { PageHeading } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiGet, apiSend } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ProfileInfo, ServerMeta, VersionCatalog } from "@/lib/types";

const TEMPLATES = ["Empty World", "Blank Sandbox", "High Rate Sandbox"];

export default function CreateServer() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(0);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [catalog, setCatalog] = useState<VersionCatalog | null>(null);
  const [name, setName] = useState("");
  const [profile, setProfile] = useState("fe-7.4");
  const [engineVersion, setEngineVersion] = useState("");
  const [template, setTemplate] = useState(TEMPLATES[0]);
  const [motd, setMotd] = useState("");
  const [enableOtcNative, setEnableOtcNative] = useState(true);
  const [enableLegacyLogin, setEnableLegacyLogin] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ profiles: ProfileInfo[] }>("/profiles").then((body) => {
      setProfiles(body.profiles);
      if (!body.profiles.some((entry) => entry.id === profile)) {
        setProfile(body.profiles[0]?.id ?? "fe-7.4");
      }
    });
    apiGet<VersionCatalog>("/versions").then((body) => {
      setCatalog(body);
      setEngineVersion((current) => current || body.versions[0]?.tag || "");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const profileVersions = useMemo(() => catalog?.versions ?? [], [catalog]);
  const nameValid = /^[A-Za-z0-9][A-Za-z0-9 _-]{1,38}$/.test(name);

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const result = await apiSend<{ meta: ServerMeta }>("/servers", "POST", {
        name,
        profile,
        engineVersion,
        template,
        motd,
        enableOtcNative,
        enableLegacyLogin,
      });
      navigate(`/servers/${result.meta.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setCreating(false);
    }
  }

  const steps = ["Identity", "Compatibility", "Options", "Review"];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeading
        title="Create a server"
        subtitle="Provision a fresh Forgotten Engine world — the panel handles init, ports and the engine binary."
        icon={Rocket}
      />

      {/* Step rail */}
      <div className="mb-6 flex items-center gap-2">
        {steps.map((label, index) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <button
              onClick={() => index <= step && setStep(index)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-all",
                index === step && "brand-ring bg-card",
                index < step && "border-transparent text-muted-foreground hover:text-foreground",
                index > step && "border-dashed text-muted-foreground/60",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px]",
                  index < step ? "bg-primary/20" : "bg-secondary",
                )}
              >
                {index < step ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {index < steps.length - 1 && (
              <div className="h-px flex-1 bg-border" aria-hidden />
            )}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.25 }}
        >
          <Card>
            <CardContent className="pt-6">
              {step === 0 && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="server-name">World name</Label>
                    <Input
                      id="server-name"
                      placeholder="e.g. Kalimdoom RP"
                      value={name}
                      maxLength={39}
                      onChange={(event) => setName(event.target.value)}
                      className="mt-1.5"
                      autoFocus
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Letters, digits, spaces, dashes. Used as the engine serverName.
                    </p>
                  </div>
                  <div>
                    <Label>Template</Label>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {TEMPLATES.map((candidate) => (
                        <button
                          key={candidate}
                          onClick={() => setTemplate(candidate)}
                          className={cn(
                            "rounded-xl border px-3 py-3 text-left transition-all hover:border-transparent",
                            template === candidate ? "brand-ring bg-card" : "bg-card/50",
                          )}
                        >
                          <Sparkles className="h-4 w-4 text-primary" />
                          <div className="mt-2 text-sm font-semibold">{candidate}</div>
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Templates ship the FE original content skeleton with an FE-native starter map;
                      richer packs arrive with upstream content drops.
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Button disabled={!nameValid} onClick={() => setStep(1)}>
                      Continue <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <Label>Compatibility profile</Label>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {profiles.map((candidate) => (
                        <button
                          key={candidate.id}
                          onClick={() => setProfile(candidate.id)}
                          className={cn(
                            "rounded-xl border p-3 text-left transition-all hover:border-transparent",
                            profile === candidate.id ? "brand-ring bg-card" : "bg-card/50",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold">{candidate.label}</span>
                            {candidate.experimental && (
                              <Badge variant="outline" className="font-mono text-[9px]">
                                exp
                              </Badge>
                            )}
                          </div>
                          <div className="mono-label mt-1">{candidate.reference}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Engine release</Label>
                    {!catalog ? (
                      <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> fetching releases…
                      </div>
                    ) : (
                      <select
                        value={engineVersion}
                        onChange={(event) => setEngineVersion(event.target.value)}
                        className="mt-2 h-10 w-full rounded-md border bg-card px-3 font-mono text-sm"
                      >
                        {profileVersions.map((version) => (
                          <option key={version.tag} value={version.tag}>
                            {version.tag}
                            {version.installed ? "  ✓ installed" : ""}
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Source: {catalog?.source ?? "…"} · the matching binary is installed on first
                      start (release asset → cargo build → local copy).
                    </p>
                  </div>
                  <div className="flex justify-between">
                    <Button variant="ghost" onClick={() => setStep(0)}>
                      Back
                    </Button>
                    <Button disabled={!engineVersion} onClick={() => setStep(2)}>
                      Continue <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="motd">Message of the day (optional)</Label>
                    <Input
                      id="motd"
                      value={motd}
                      maxLength={200}
                      onChange={(event) => setMotd(event.target.value)}
                      placeholder="Welcome to the realm…"
                      className="mt-1.5"
                    />
                  </div>
                  <ToggleRow
                    label="OTClientV8 native path"
                    hint="Allocates OTClientV8 login/game ports (717x range)."
                    checked={enableOtcNative}
                    onChange={setEnableOtcNative}
                  />
                  <ToggleRow
                    label="Legacy login foundation (7.4)"
                    hint="Requires generating an RSA key afterwards; bounded feature."
                    checked={enableLegacyLogin}
                    onChange={setEnableLegacyLogin}
                  />
                  <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                    Status/game (+ optional OTC/session) ports are auto-allocated in a free block so
                    multiple worlds can run side by side.
                  </p>
                  <div className="flex justify-between">
                    <Button variant="ghost" onClick={() => setStep(1)}>
                      Back
                    </Button>
                    <Button onClick={() => setStep(3)}>
                      Review <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-xl border bg-card/40 p-4 font-mono text-sm">
                    <dt className="mono-label pt-0.5">name</dt>
                    <dd>{name}</dd>
                    <dt className="mono-label pt-0.5">template</dt>
                    <dd>{template}</dd>
                    <dt className="mono-label pt-0.5">profile</dt>
                    <dd>{profile}</dd>
                    <dt className="mono-label pt-0.5">engine</dt>
                    <dd>{engineVersion}</dd>
                    <dt className="mono-label pt-0.5">otc native</dt>
                    <dd>{String(enableOtcNative)}</dd>
                    <dt className="mono-label pt-0.5">legacy login</dt>
                    <dd>{String(enableLegacyLogin)}</dd>
                  </dl>
                  {error && (
                    <p className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
                      {error}
                    </p>
                  )}
                  <div className="flex justify-between">
                    <Button variant="ghost" onClick={() => setStep(2)} disabled={creating}>
                      Back
                    </Button>
                    <Button onClick={create} disabled={creating}>
                      {creating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> provisioning world…
                        </>
                      ) : (
                        <>
                          <Rocket className="mr-2 h-4 w-4" /> Create server
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border bg-card/40 p-3">
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
