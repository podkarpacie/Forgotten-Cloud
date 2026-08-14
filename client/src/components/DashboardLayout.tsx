import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { Boxes, Compass, LayoutDashboard, LogOut, Plus, ServerCog } from "lucide-react";
import { Link, useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const menuItems = [
  { icon: LayoutDashboard, label: "My servers", path: "/" },
  { icon: Compass, label: "Discovery", path: "/discovery" },
  { icon: Boxes, label: "Plugin registry", path: "/registry" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user, logout } = useAuth();
  const [location] = useLocation();
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) {
    return <div className="min-h-screen grid place-items-center p-6"><div className="blueprint-panel max-w-md p-8 text-center"><p className="tech-label mb-3">Authentication required</p><h1 className="text-3xl font-black tracking-tight">Access your control plane.</h1><p className="mt-3 text-sm text-slate-600">Sign in to create and manage Forgotten Engine instances.</p><Button className="mt-6 w-full" onClick={() => startLogin()}>Sign in</Button></div></div>;
  }
  return (
    <SidebarProvider>
      <Sidebar className="border-r border-slate-300/80 bg-sidebar/90 backdrop-blur-xl" collapsible="icon">
        <SidebarHeader className="h-20 border-b border-slate-300/80 px-3 justify-center">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="grid h-9 w-9 place-items-center rounded-sm bg-slate-900 text-white shadow-sm"><ServerCog className="h-5 w-5" /></div>
            <div className="group-data-[collapsible=icon]:hidden"><p className="text-sm font-black tracking-tight">FORGOTTEN</p><p className="tech-label text-[8px]">Cloud control plane</p></div>
          </Link>
        </SidebarHeader>
        <SidebarContent className="px-2 py-4">
          <p className="tech-label px-2 pb-2 group-data-[collapsible=icon]:hidden">Navigation</p>
          <SidebarMenu>
            {menuItems.map(item => <SidebarMenuItem key={item.path}><Link href={item.path}><SidebarMenuButton isActive={location === item.path} tooltip={item.label} className="h-10 rounded-sm"><item.icon className="h-4 w-4" /><span>{item.label}</span></SidebarMenuButton></Link></SidebarMenuItem>)}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="border-t border-slate-300/80 p-3">
          <Link href="/"><Button size="sm" className="w-full group-data-[collapsible=icon]:px-2"><Plus className="h-4 w-4" /><span className="ml-1 group-data-[collapsible=icon]:hidden">Create server</span></Button></Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button className="mt-3 flex w-full items-center gap-3 rounded-sm px-1 py-1.5 text-left hover:bg-cyan-100/60"><Avatar className="h-8 w-8 border border-cyan-300"><AvatarFallback className="bg-cyan-50 text-xs text-slate-700">{user.name?.[0]?.toUpperCase() ?? "F"}</AvatarFallback></Avatar><div className="min-w-0 group-data-[collapsible=icon]:hidden"><p className="truncate text-xs font-semibold">{user.name ?? "Forgotten user"}</p><p className="tech-label mt-0.5 text-[8px]">Authenticated</p></div></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end"><DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem></DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset><main className="min-h-screen p-4 md:p-8">{children}</main></SidebarInset>
    </SidebarProvider>
  );
}
