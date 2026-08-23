import { motion } from "framer-motion";
import { ArrowUp, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, apiSend } from "@/lib/api";
import type { ConsoleLine, RuntimeSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function ConsoleTab({ id }: { id: string }) {
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [runtime, setRuntime] = useState<RuntimeSnapshot | null>(null);
  const [input, setInput] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set<number>());

  // Initial history
  useEffect(() => {
    apiGet<{ lines: ConsoleLine[]; runtime: RuntimeSnapshot }>(
      `/servers/${id}/console/history?limit=600`,
    )
      .then((body) => {
        setLines(body.lines);
        setRuntime(body.runtime);
        for (const line of body.lines) seen.current.add(line.seq);
      })
      .catch(() => undefined);
  }, [id]);

  // Live stream
  useEffect(() => {
    const source = new EventSource(`/api/servers/${id}/console/stream`);
    source.addEventListener("line", (event) => {
      const line = JSON.parse((event as MessageEvent).data) as ConsoleLine;
      if (seen.current.has(line.seq)) return;
      seen.current.add(line.seq);
      setLines((current) => [...current.slice(-1500), line]);
    });
    source.addEventListener("status", (event) => {
      setRuntime(JSON.parse((event as MessageEvent).data) as RuntimeSnapshot);
    });
    source.onerror = () => source.close();
    return () => source.close();
  }, [id]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  async function send() {
    const command = input.trim();
    if (!command) return;
    setInput("");
    try {
      await apiSend(`/servers/${id}/console/input`, "POST", { input: command });
      if (command === "/clear") setLines([]);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="mono-label">
          live console · {runtime ? `${runtime.status}${runtime.pid ? ` · pid ${runtime.pid}` : ""}` : "…"}
        </div>
        <div className="flex items-center gap-2">
          <label className="mono-label flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(event) => setAutoScroll(event.target.checked)}
              className="accent-[var(--brand)]"
            />
            follow
          </label>
          <Button size="sm" variant="ghost" onClick={() => void send().then(() => setInput("/clear"))}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          const atBottom =
            element.scrollHeight - element.scrollTop - element.clientHeight < 40;
          if (!atBottom && autoScroll) setAutoScroll(false);
        }}
        className="console-scroll h-[52vh] overflow-auto rounded-xl border bg-background/70 p-3 font-mono text-[12px] leading-relaxed"
      >
        {lines.length === 0 && (
          <p className="text-muted-foreground">
            No output yet. Start the server to see engine logs stream here.
          </p>
        )}
        {lines.map((line) => (
          <motion.div
            key={line.seq}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={cn(
              "whitespace-pre-wrap break-words",
              line.stream === "err" && "text-red-400",
              line.stream === "system" && "text-muted-foreground",
            )}
          >
            <span className="mr-2 select-none text-[10px] text-muted-foreground/60">
              {new Date(line.time).toLocaleTimeString()}
            </span>
            {line.text}
          </motion.div>
        ))}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className="flex gap-2"
      >
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            runtime?.status === "running"
              ? "stdin line · /broadcast hello · /clear"
              : "/clear works while offline; stdin needs a running server"
          }
          className="font-mono text-sm"
        />
        <Button type="submit" size="icon" aria-label="send">
          <ArrowUp className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
