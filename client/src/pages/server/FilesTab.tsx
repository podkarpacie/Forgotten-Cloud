import { motion } from "framer-motion";
import {
  ChevronRight,
  Download,
  File as FileIcon,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  Pencil,
  Save,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiGet, fileText } from "@/lib/api";
import type { FileNode } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function FilesTab({ id }: { id: string }) {
  const [cwd, setCwd] = useState(".");
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<"file" | "dir" | null>(null);
  const [newName, setNewName] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);

  const loadDir = useCallback(
    (path: string) => {
      setLoading(true);
      apiGet<{ cwd: string; nodes: FileNode[] }>(
        `/servers/${id}/list?path=${encodeURIComponent(path)}`,
      )
        .then((body) => {
          setNodes(body.nodes);
          setCwd(body.cwd);
        })
        .catch((cause) => toast.error(cause instanceof Error ? cause.message : String(cause)))
        .finally(() => setLoading(false));
    },
    [id],
  );

  useEffect(() => loadDir("."), [loadDir]);

  async function open(node: FileNode) {
    if (node.type === "dir") return loadDir(node.path);
    try {
      const text = await fileText(id, node.path);
      setOpenFile(node.path);
      setContent(text);
      setDirty(false);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function save() {
    if (!openFile) return;
    const response = await fetch(
      `/api/servers/${id}/file?path=${encodeURIComponent(openFile)}`,
      {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "text/plain" },
        body: content,
      },
    );
    if (response.ok) {
      toast.success("Saved");
      setDirty(false);
      loadDir(cwd);
    } else {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      toast.error(body?.error ?? `${response.status} save failed`);
    }
  }

  async function createEntry() {
    if (!newName.trim() || !creating) return;
    const path = `${cwd === "." ? "" : `${cwd}/`}${newName.trim()}`;
    await fetch(`/api/servers/${id}/${creating === "dir" ? "mkdir" : "touch"}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    setCreating(null);
    setNewName("");
    loadDir(cwd);
  }

  async function remove(node: FileNode) {
    if (!confirm(`Delete ${node.name}?`)) return;
    await fetch(`/api/servers/${id}/file?path=${encodeURIComponent(node.path)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (openFile === node.path) {
      setOpenFile(null);
      setContent("");
    }
    toast.success("Deleted");
    loadDir(cwd);
  }

  async function rename(node: FileNode) {
    const next = prompt(`Rename ${node.name} to:`, node.name);
    if (!next || next === node.name) return;
    await fetch(`/api/servers/${id}/rename`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: node.path, to: next.includes("/") ? next : `${cwd === "." ? "" : `${cwd}/`}${next}` }),
    });
    loadDir(cwd);
  }

  async function upload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    for (const file of Array.from(fileList)) {
      const target = `${cwd === "." ? "" : `${cwd}/`}${file.name}`;
      await fetch(`/api/servers/${id}/file?path=${encodeURIComponent(target)}`, {
        method: "PUT",
        credentials: "same-origin",
        body: await file.arrayBuffer(),
      });
    }
    toast.success("Uploaded");
    loadDir(cwd);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      {/* Explorer */}
      <div className="panel rounded-lg p-3">
        <div className="mb-2 flex items-center justify-between gap-1">
          <div className="label-meta truncate">{cwd}</div>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" title="New folder" onClick={() => setCreating("dir")}>
              <FolderPlus className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" title="New file" onClick={() => setCreating("file")}>
              <FilePlus2 className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" title="Upload files" onClick={() => uploadRef.current?.click()}>
              <UploadCloud className="h-3.5 w-3.5" />
            </Button>
            <input
              ref={uploadRef}
              type="file"
              multiple
              hidden
              onChange={(event) => void upload(event.target.files)}
            />
          </div>
        </div>

        {creating && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void createEntry();
            }}
            className="mb-2 flex gap-1"
          >
            <Input
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder={creating === "dir" ? "folder name" : "file name"}
              className="h-8 text-xs"
            />
            <Button size="sm" type="submit" className="h-8 px-2">
              ok
            </Button>
            <Button
              size="icon"
              type="button"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setCreating(null)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </form>
        )}

        <ScrollArea className="h-[52vh]">
          {cwd !== "." && (
            <button
              onClick={() => loadDir(cwd.split("/").slice(0, -1).join("/") || ".")}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-secondary/60"
            >
              <ChevronRight className="h-4 w-4 rotate-180" /> ..
            </button>
          )}
          {loading && <p className="px-2 py-1 text-xs text-muted-foreground">loading…</p>}
          {!loading &&
            nodes.map((node) => (
              <motion.div
                key={node.path}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onDoubleClick={() => void open(node)}
                className={cn(
                  "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary/60",
                  openFile === node.path && "bg-secondary text-primary",
                )}
              >
                <button onClick={() => void open(node)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  {node.type === "dir" ? (
                    <FolderOpen className="h-4 w-4 shrink-0 text-primary/70" />
                  ) : (
                    <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{node.name}</span>
                </button>
                {node.type === "file" && (
                  <>
                    <a
                      href={`/api/servers/${id}/file?path=${encodeURIComponent(node.path)}&download=1`}
                      title="download"
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Download className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                    </a>
                    <button title="rename" onClick={() => void rename(node)} className="opacity-0 transition-opacity group-hover:opacity-100">
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                  </>
                )}
                <button title="delete" onClick={() => void remove(node)} className="opacity-0 transition-opacity group-hover:opacity-100">
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </motion.div>
            ))}
        </ScrollArea>
      </div>

      {/* Editor */}
      <div className="panel flex min-h-[56vh] flex-col rounded-lg p-3">
        {openFile === null ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select a text file to edit it here.
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="label-meta truncate">{openFile}{dirty ? " · modified" : ""}</div>
              <div className="flex gap-2">
                <Button size="sm" disabled={!dirty} onClick={() => void save()}>
                  <Save className="mr-1.5 h-3.5 w-3.5" /> Save
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => {
                    setOpenFile(null);
                    setContent("");
                    setDirty(false);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <textarea
              spellCheck={false}
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                setDirty(true);
              }}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "s") {
                  event.preventDefault();
                  void save();
                }
                if (event.key === "Tab") {
                  event.preventDefault();
                  const target = event.currentTarget;
                  const start = target.selectionStart;
                  const next = `${content.slice(0, start)}  ${content.slice(target.selectionEnd)}`;
                  setContent(next);
                  requestAnimationFrame(() => {
                    target.selectionStart = target.selectionEnd = start + 2;
                  });
                }
              }}
              className="console-scroll h-[48vh] flex-1 resize-none rounded-lg border bg-background/70 p-3 font-mono text-[12.5px] leading-relaxed outline-none focus:ring-1 focus:ring-ring"
            />
          </>
        )}
      </div>
    </div>
  );
}


