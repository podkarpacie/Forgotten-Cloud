import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { Server } from "lucide-react";
import { Link } from "wouter";

export default function PublicFrame({ children }: { children: React.ReactNode }) {
  return <div className="relative min-h-screen overflow-hidden px-5 py-6 md:px-10"><header className="relative mx-auto flex max-w-6xl items-center justify-between border-b border-slate-300/80 pb-5"><Link href="/" className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center bg-slate-900 text-white"><Server className="h-4 w-4" /></div><div><p className="text-sm font-black tracking-tight">FORGOTTEN CLOUD</p><p className="tech-label text-[8px]">Open Tibia platform</p></div></Link><div className="flex items-center gap-3"><Link href="/discovery" className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-600 hover:text-slate-950">Discovery</Link><Link href="/registry" className="hidden font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-600 hover:text-slate-950 sm:block">Registry</Link><Button size="sm" variant="outline" className="rounded-sm bg-white/70" onClick={() => startLogin()}>Sign in</Button></div></header>{children}</div>;
}
