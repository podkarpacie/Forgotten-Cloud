import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Discovery from "./pages/Discovery";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import Registry from "./pages/Registry";
import ServerControl from "./pages/ServerControl";

function Router() { return <Switch><Route path="/" component={Home} /><Route path="/servers/:id" component={ServerControl} /><Route path="/discovery" component={Discovery} /><Route path="/registry" component={Registry} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>; }
function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }
export default App;
