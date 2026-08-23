import { Database, Download, Play, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiSend } from "@/lib/api";

interface DbInfo {
  file: string;
  bytes: number;
  schemaVersion: number | null;
}
interface ColumnInfo {
  name: string;
  type: string;
  pk: boolean;
}
interface TableInfo {
  name: string;
  rowCount: number;
  columns: ColumnInfo[];
}
interface QueryResult {
  statement: string;
  ok: boolean;
  rows?: Record<string, unknown>[];
  changes?: number;
  error?: string;
}

export default function DatabaseTab({ id }: { id: string }) {
  const [info, setInfo] = useState<DbInfo | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [sql, setSql] = useState("SELECT id, name, level FROM players ORDER BY level DESC LIMIT 20;");
  const [writeMode, setWriteMode] = useState(false);
  const [results, setResults] = useState<QueryResult[] | null>(null);

  const loadMeta = useCallback(() => {
    apiGet<{ tables: TableInfo[] }>(`/servers/${id}/tables`)
      .then((body) => setTables(body.tables))
      .catch((cause) => toast.error(cause instanceof Error ? cause.message : String(cause)));
    apiGet<DbInfo>(`/servers/${id}/info`).then(setInfo).catch(() => undefined);
  }, [id]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  async function openTable(name: string) {
    setSelected(name);
    try {
      const body = await apiGet<{ rows: Record<string, unknown>[]; total: number }>(
        `/servers/${id}/table/${name}?limit=100`,
      );
      setRows(body.rows);
      setTotal(body.total);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function runQuery() {
    try {
      const body = await apiSend<{ results: QueryResult[] }>(
        `/servers/${id}/query`,
        "POST",
        { sql, write: writeMode },
      );
      setResults(body.results);
      if (writeMode) loadMeta();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <Tabs defaultValue="browse" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <TabsList>
          <TabsTrigger value="browse">Browse</TabsTrigger>
          <TabsTrigger value="query">SQL console</TabsTrigger>
          <TabsTrigger value="players">Players & accounts</TabsTrigger>
        </TabsList>
        {info && (
          <span className="mono-label">
            {info.file} · {(info.bytes / 1024).toFixed(1)} KB · schema v{info.schemaVersion ?? "?"}
          </span>
        )}
      </div>

      <TabsContent value="browse" className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <ScrollArea className="glass-panel h-[56vh] rounded-xl p-2">
          {tables.map((table) => (
            <button
              key={table.name}
              onClick={() => void openTable(table.name)}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left font-mono text-xs hover:bg-secondary/60 ${
                selected === table.name ? "bg-secondary text-primary" : ""
              }`}
            >
              <span className="truncate">{table.name}</span>
              <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">{table.rowCount}</span>
            </button>
          ))}
        </ScrollArea>

        <Card className="overflow-hidden">
          <CardContent className="p-0 pt-0">
            {selected === null ? (
              <div className="flex h-[56vh] items-center justify-center text-sm text-muted-foreground">
                Pick a table to preview its rows.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <div className="mono-label">{selected} · first 100 of {total}</div>
                  <a href={`/api/servers/${id}/export-table?table=${selected}&format=csv`}>
                    <Button size="sm" variant="ghost">
                      <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
                    </Button>
                  </a>
                </div>
                <ScrollArea className="h-[52vh]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card backdrop-blur">
                      <TableRow>
                        {Object.keys(rows[0] ?? {}).map((column) => (
                          <TableHead key={column} className="font-mono text-xs">
                            {column}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row, index) => (
                        <TableRow key={index}>
                          {Object.entries(row).map(([column, value]) => (
                            <TableCell key={column} className="max-w-64 truncate font-mono text-xs">
                              {value === null || value === undefined
                                ? "∅"
                                : typeof value === "object"
                                  ? JSON.stringify(value)
                                  : String(value)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="query">
        <div className="space-y-3">
          <label className="mono-label flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={writeMode}
              onChange={(event) => setWriteMode(event.target.checked)}
              className="accent-[var(--brand)]"
            />
            write mode (requires stopped server; default read-only snapshot)
          </label>
          <Textarea
            value={sql}
            onChange={(event) => setSql(event.target.value)}
            spellCheck={false}
            className="console-scroll h-40 resize-y font-mono text-sm"
          />
          <Button onClick={() => void runQuery()}>
            <Play className="mr-2 h-4 w-4" /> Run
          </Button>
          {results && (
            <div className="space-y-2">
              {results.map((result, index) => (
                <div key={index} className="rounded-lg border bg-background/60 p-3">
                  <div className="mono-label mb-1 flex items-center gap-2">
                    <Zap className="h-3 w-3" />
                    {result.ok ? `ok${result.changes ? ` · ${result.changes} changed` : ""}` : "error"}
                  </div>
                  <pre className="console-scroll max-h-72 overflow-auto whitespace-pre-wrap break-all font-mono text-[11.5px]">
                    {result.ok
                      ? JSON.stringify(result.rows?.length ? result.rows : result.changes, null, 2)
                      : result.error}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="players">
        <PlayersPanel id={id} />
      </TabsContent>
    </Tabs>
  );
}

function PlayersPanel({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState("");
  const [form, setForm] = useState({
    accountName: "",
    accountPassword: "",
    playerName: "",
    accountId: "",
    vocationId: "",
  });

  async function act(action: string, extra: Record<string, string | undefined> = {}) {
    setBusy(true);
    setOutput("");
    try {
      const body = await apiSend<{ code: number; output: string }>(
        `/servers/${id}/players/action`,
        "POST",
        { action, ...extra },
      );
      setOutput(body.output || `(exit ${body.code})`);
      toast.success("Engine command executed");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  const input = (key: keyof typeof form, placeholder: string, type = "text") => (
    <input
      value={form[key]}
      type={type}
      placeholder={placeholder}
      onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
      className="h-9 rounded-md border bg-card px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
    />
  );

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <p className="text-xs text-muted-foreground">
          These actions call the real engine CLI (<code>account create</code>,{" "}
          <code>player create</code>, …). The SQL tab above can inspect everything the engine
          persists.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-xl border p-4">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Database className="h-4 w-4 text-primary" /> Create account
            </h4>
            <div className="flex flex-wrap items-center gap-2">
              {input("accountName", "account name")}
              {input("accountPassword", "password", "password")}
              <Button size="sm" disabled={busy} onClick={() => void act("account-create", { name: form.accountName, password: form.accountPassword })}>
                create
              </Button>
            </div>
          </section>
          <section className="rounded-xl border p-4">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Database className="h-4 w-4 text-primary" /> Create player
            </h4>
            <div className="flex flex-wrap items-center gap-2">
              {input("accountId", "account id")}
              {input("playerName", "character name")}
              {input("vocationId", "vocation id (opt.)")}
              <Button size="sm" disabled={busy} onClick={() => void act("player-create", { accountId: form.accountId, name: form.playerName, vocationId: form.vocationId || undefined })}>
                create
              </Button>
            </div>
          </section>
        </div>
        {output && (
          <pre className="console-scroll max-h-48 overflow-auto rounded-lg border bg-background/60 p-3 font-mono text-xs">
            {output}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
