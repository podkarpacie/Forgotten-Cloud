import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { AppShell } from "./components/layout";
import { ThemeProvider } from "./lib/theme";
import CreateServer from "./pages/CreateServer";
import Dashboard from "./pages/Dashboard";
import EngineManager from "./pages/EngineManager";
import NotFound from "./pages/NotFound";
import PluginsPage from "./pages/PluginsPage";
import ServerDetail from "./pages/ServerDetail";
import SettingsPage from "./pages/SettingsPage";

function Router() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/create" component={CreateServer} />
        <Route path="/engine" component={EngineManager} />
        <Route path="/plugins" component={PluginsPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/servers/:id/:tab?" component={ServerDetail} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <TooltipProvider delayDuration={200}>
          <Toaster position="bottom-right" richColors closeButton />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
