import { cn } from "@/lib/utils";

export function LogoMark({ className, size = 30 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <path
        d="M32 4 56 17.5v29L32 60 8 46.5v-29L32 4Z"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinejoin="round"
        opacity="0.9"
      />
      <path
        d="M24.5 40a6.5 6.5 0 0 1-.9-12.94A9.5 9.5 0 0 1 42 26.6 7.2 7.2 0 0 1 41 40H24.5Z"
        fill="currentColor"
        opacity="0.92"
      />
      <path d="M24 45.5h16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function BrandHeader({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 text-foreground">
      <LogoMark size={compact ? 26 : 30} />
      <div className="leading-tight">
        <div className={cn("font-semibold tracking-wide", compact ? "text-sm" : "text-[15px]")}>
          Forgotten Cloud
        </div>
        {!compact && <div className="label-meta mt-px text-[9px]">local control plane</div>}
      </div>
    </div>
  );
}

