import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet, apiSend } from "@/lib/api";
import type { RuntimeSnapshot, ServerMeta, ServerPorts } from "@/lib/types";

interface SetupState {
  engineInstalled: boolean;
  accounts: number;
  players: number;
  firstAccountId: number | null;
  mapName: string;
  mapFilePresent: boolean;
  running: boolean;
  host: string;
  ports: ServerPorts;
  profile: string;
}

interface Props {
  meta: ServerMeta;
  runtime: RuntimeSnapshot;
  onChanged: () => void;
}

/** First-run checklist: turns a fresh world into a playable server step by step.
 * Hides itself once everything is green, leaving only the connect card. */
export default function SetupChecklist({ meta, runtime, onChanged }: Props) {
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [accountName, setAccountName] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [accountId, setAccountId] = useState("");

  const refresh = useCallback(() => {
    apiGet<SetupState>(`/servers/${meta.id}/setup`)
      .then((body) => {
        setSetup(body);
        setAccountId((current) => current || (body.firstAccountId !== null ? String(body.firstAccountId) : ""));
      })
      .catch(() => undefined);
  }, [meta.id]);

  useEffect(() => {
    refresh();
  }, [refresh, runtime.status]);

  // Track an engine install started from here until the binary lands.
  useEffect(() => {
    if (busy !== "engine") return;
    const timer = setInterval(() => {
      apiGet<SetupState>(`/servers/${meta.id}/setup`).then((body) => {
        setSetup(body);
        if (body.engineInstalled) setBusy(null);
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [busy, meta.id]);

  async function act(key: string, work: () => Promise<unknown>, success: string) {
    setBusy(key);
    try {
      await work();
      toast.success(success);
      refresh();
      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
      setBusy(null);
    } finally {
      if (key !== "engine") setBusy(null);
    }
  }

  if (!setup) return null;
  const running = runtime.status === "running";
  const allGreen =
    setup.engineInstalled && setup.accounts > 0 && setup.players > 0 && setup.mapFilePresent;

  return (
    <Card className={allGreen && !running ? "" : "border-primary/40"}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          {allGreen ? (running ? "Ready to play" : "Almost there — start your server") : "Getting started"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {!setup.engineInstalled && (
          <StepRow
            done={false}
            label={`Engine ${meta.engineVersion} is not installed`}
            action={
              <Button
                size="sm"
                variant="secondary"
                disabled={busy === "engine"}
                onClick={() =>
                  void act("engine", () => apiSend("/install", "POST", { version: meta.engineVersion }), `Install queued for ${meta.engineVersion}`)
                }
              >
                {busy === "engine" ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> installing…
                  </>
                ) : (
                  "Install engine"
                )}
              </Button>
            }
          />
        )}
        {setup.engineInstalled && setup.accounts === 0 && (
          <StepRow
            done={false}
            label="No account yet — create the first login"
            action={
              <span className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="account name"
                  value={accountName}
                  onChange={(event) => setAccountName(event.target.value)}
                  className="h-8 w-36"
                />
                <Input
                  placeholder="password"
                  type="password"
                  value={accountPassword}
                  onChange={(event) => setAccountPassword(event.target.value)}
                  className="h-8 w-36"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy === "account" || !accountName.trim() || !accountPassword}
                  onClick={() =>
                    void act(
                      "account",
                      () =>
                        apiSend(`/servers/${meta.id}/players/action`, "POST", {
                          action: "account-create",
                          name: accountName.trim(),
                          password: accountPassword,
                        }),
                      "Account created",
                    )
                  }
                >
                  {busy === "account" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create account"}
                </Button>
              </span>
            }
          />
        )}
        {setup.engineInstalled && setup.accounts > 0 && setup.players === 0 && (
          <StepRow
            done={false}
            label="No character yet — create one to walk the world"
            action={
              <span className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="account id"
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                  className="h-8 w-28"
                />
                <Input
                  placeholder="character name"
                  value={characterName}
                  onChange={(event) => setCharacterName(event.target.value)}
                  className="h-8 w-40"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy === "player" || !accountId.trim() || !characterName.trim()}
                  onClick={() =>
                    void act(
                      "player",
                      () =>
                        apiSend(`/servers/${meta.id}/players/action`, "POST", {
                          action: "player-create",
                          accountId: accountId.trim(),
                          name: characterName.trim(),
                        }),
                      "Character created",
                    )
                  }
                >
                  {busy === "player" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create character"}
                </Button>
              </span>
            }
          />
        )}
        {setup.engineInstalled && !setup.mapFilePresent && (
          <StepRow
            done={false}
            label={
              setup.mapName
                ? `Map "${setup.mapName}" has no world file — generate the debug map`
                : "No world map file — generate the debug map"
            }
            action={
              <Button
                size="sm"
                variant="secondary"
                disabled={busy === "debugmap"}
                onClick={() =>
                  void act(
                    "debugmap",
                    () => apiSend(`/servers/${meta.id}/tools/debug-map`, "POST", {}),
                    "Debug map generated and selected",
                  )
                }
              >
                {busy === "debugmap" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Generate debug map"}
              </Button>
            }
          />
        )}
        {allGreen && (
          <StepRow done label="Engine, login, character and map are ready" />
        )}
        {allGreen && !running && (
          <StepRow
            done={false}
            label="Server is stopped"
            action={
              <Button
                size="sm"
                disabled={busy === "start"}
                onClick={() => void act("start", () => apiSend(`/servers/${meta.id}/start`, "POST"), "Server started")}
              >
                {busy === "start" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                Start server
              </Button>
            }
          />
        )}
        {running && <ConnectCard setup={setup} />}
      </CardContent>
    </Card>
  );
}

function StepRow({
  done,
  label,
  action,
}: {
  done: boolean;
  label: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/40 px-3 py-2">
      <span className="flex items-center gap-2 text-sm">
        {done ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
        ) : (
          <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        {label}
      </span>
      {action}
    </div>
  );
}

function ConnectCard({ setup }: { setup: SetupState }) {
  const protocol = setup.profile.startsWith("fe-") ? setup.profile.slice(3) : setup.profile;
  return (
    <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/5 px-3 py-2 font-mono text-xs leading-relaxed">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        connect a client
      </div>
      {setup.ports.otcLogin && setup.ports.otcGame ? (
        <p>
          OTClientV8 → login {setup.host}:{setup.ports.otcLogin} · game {setup.host}:{setup.ports.otcGame} ·
          protocol {protocol} · numeric account id
        </p>
      ) : (
        <p>
          legacy 7.4 → {setup.host}:{setup.ports.game} · protocol {protocol}
        </p>
      )}
      <p className="mt-1 font-sans text-[11px] text-muted-foreground">
        Use the account name + password you created. Prefer a one-click setup?{" "}
        <Link href="/clients" className="text-primary underline underline-offset-2">
          Package a preconfigured client
        </Link>
        .
      </p>
    </div>
  );
}
