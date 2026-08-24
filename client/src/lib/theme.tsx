import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "dark" | "light" | "midnight";
export type ThemeAccent = "graphite" | "teal" | "plum" | "amber" | "crimson" | "moss";

interface ThemeState {
  mode: ThemeMode;
  accent: ThemeAccent;
  motion: boolean;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: ThemeAccent) => void;
  setMotion: (motion: boolean) => void;
}

const COOKIE_NAME = "fc_theme";
const DEFAULTS: ThemeState = {
  mode: "dark",
  accent: "graphite",
  motion: true,
} as never;

function readCookie(): Partial<Pick<ThemeState, "mode" | "accent" | "motion">> {
  const pair = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${COOKIE_NAME}=`));
  if (!pair) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(pair.slice(COOKIE_NAME.length + 1)));
    // Migrate pre-v2.1 accent names gracefully.
    const legacy: Record<string, ThemeAccent> = { cyan: "graphite", violet: "plum", ember: "amber", lime: "teal" };
    if (typeof parsed.accent === "string" && parsed.accent in legacy) {
      parsed.accent = legacy[parsed.accent];
    }
    return parsed;
  } catch {
    return {};
  }
}

function writeCookie(state: Pick<ThemeState, "mode" | "accent" | "motion">): void {
  // Keep preferences for a full year; purely local convenience.
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(
    JSON.stringify({ mode: state.mode, accent: state.accent, motion: state.motion }),
  )}; path=/; max-age=31536000; samesite=strict`;
}

const ThemeContext = createContext<ThemeState>(DEFAULTS);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ThemeState>(() => ({
    ...DEFAULTS,
    ...readCookie(),
  }));

  useEffect(() => {
    document.documentElement.dataset.mode = state.mode;
    document.documentElement.dataset.accent = state.accent;
    writeCookie(state);
  }, [state]);

  const setMode = useCallback((mode: ThemeMode) => setState((s) => ({ ...s, mode })), []);
  const setAccent = useCallback(
    (accent: ThemeAccent) => setState((s) => ({ ...s, accent })),
    [],
  );
  const setMotion = useCallback((motion: boolean) => setState((s) => ({ ...s, motion })), []);

  const value = useMemo(() => ({ ...state, setMode, setAccent, setMotion }), [state, setMode, setAccent, setMotion]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  return useContext(ThemeContext);
}
