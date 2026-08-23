import { Loader2, RotateCcw, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiGet, apiSend } from "@/lib/api";

type ConfigValue = string | number | boolean;

interface SchemaEntry {
  key: string;
  group: string;
  type: "string" | "number" | "boolean" | "stages";
  default?: string;
  label: string;
  hint?: string;
  advanced?: boolean;
}

export default function ConfigTab({ id }: { id: string }) {
  const [values, setValues] = useState<Record<string, ConfigValue>>({});
  const [schema, setSchema] = useState<SchemaEntry[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadConfig = useCallback(() => {
    apiGet<{ values: Record<string, ConfigValue>; schema: SchemaEntry[] }>(
      `/servers/${id}/config`,
    )
      .then((body) => {
        setValues(body.values);
        setSchema(body.schema);
      })
      .catch((cause) => toast.error(cause instanceof Error ? cause.message : String(cause)));
  }, [id]);

  useEffect(loadConfig, [loadConfig]);

  const grouped = useMemo(() => {
    const map = new Map<string, SchemaEntry[]>();
    for (const entry of schema) {
      if (!map.has(entry.group)) map.set(entry.group, []);
      map.get(entry.group)!.push(entry);
    }
    return [...map.entries()];
  }, [schema]);

  async function save() {
    setSaving(true);
    try {
      const result = await apiSend<{ requiresRestart: boolean }>(
        `/servers/${id}/config`,
        "PUT",
        { values },
      );
      toast.success(
        result.requiresRestart
          ? "Saved · restart the server to apply"
          : "Saved",
      );
      if (result.requiresRestart) loadConfig();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="mono-label flex cursor-pointer items-center gap-2">
          <Switch checked={showAdvanced} onCheckedChange={setShowAdvanced} />
          show advanced keys
        </label>
        <Button onClick={save} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save config.lua
        </Button>
      </div>

      {grouped.map(([group, entries]) => {
        const visible = entries.filter((entry) => showAdvanced || !entry.advanced);
        if (visible.length === 0) return null;
        return (
          <Card key={group}>
            <CardContent className="pt-5">
              <div className="mono-label mb-3">{group}</div>
              <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
                {visible.map((entry) => (
                  <div key={entry.key} className={entry.type === "stages" ? "md:col-span-2" : ""}>
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`cfg-${entry.key}`} className="text-[13px] font-medium">
                        {entry.label}
                        {entry.advanced && (
                          <Badge variant="outline" className="ml-2 px-1 py-0 font-mono text-[9px]">
                            adv
                          </Badge>
                        )}
                      </Label>
                      <code className="font-mono text-[10px] text-muted-foreground">{entry.key}</code>
                    </div>
                    <div className="mt-1.5">
                      {entry.type === "boolean" ? (
                        <Switch
                          id={`cfg-${entry.key}`}
                          checked={Boolean(values[entry.key])}
                          onCheckedChange={(checked) =>
                            setValues((current) => ({ ...current, [entry.key]: checked }))
                          }
                        />
                      ) : entry.type === "stages" ? (
                        <>
                          <Input
                            id={`cfg-${entry.key}`}
                            disabled
                            value={
                              values[entry.key] !== undefined
                                ? String(values[entry.key])
                                : "(not set — edit raw file via Files tab)"
                            }
                            className="font-mono text-xs"
                          />
                          <p className="mt-1 text-xs text-muted-foreground">{entry.hint}</p>
                        </>
                      ) : (
                        <Input
                          id={`cfg-${entry.key}`}
                          value={String(values[entry.key] ?? "")}
                          type={entry.type === "number" ? "number" : "text"}
                          onChange={(event) =>
                            setValues((current) => ({
                              ...current,
                              [entry.key]:
                                entry.type === "number"
                                  ? Number(event.target.value || 0)
                                  : event.target.value,
                            }))
                          }
                        />
                      )}
                    </div>
                    {entry.hint && entry.type !== "stages" && (
                      <p className="mt-1 text-xs text-muted-foreground">{entry.hint}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <p className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <RotateCcw className="h-3.5 w-3.5 shrink-0" />
        The writer preserves every comment and unknown line in config.lua; only recognized keys are
        rewritten.
      </p>
    </div>
  );
}
