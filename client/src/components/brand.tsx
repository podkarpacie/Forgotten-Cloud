import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function LogoMark({ className, size = 34 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id="lg-mark" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--brand)" />
          <stop offset="0.55" stopColor="var(--brand-2)" />
          <stop offset="1" stopColor="var(--brand-3)" />
        </linearGradient>
      </defs>
      <path d="M32 3 57 17v30L32 61 7 47V17L32 3Z" fill="url(#lg-mark)" opacity="0.95" />
      <path d="M32 8.5 52 19.5v25L32 55.5 12 44.5v-25L32 8.5Z" fill="color-mix(in oklab, var(--background) 82%, black)" />
      <path
        d="M24.5 41a6.5 6.5 0 0 1-.9-12.94A9.5 9.5 0 0 1 42 26.6 7.2 7.2 0 0 1 41 41H24.5Z"
        fill="url(#lg-mark)"
      />
      <circle cx="43.5" cy="20.5" r="2.2" fill="var(--brand-3)" />
      <path d="M22 46.5h20" stroke="url(#lg-mark)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function BrandHeader({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <motion.div whileHover={{ rotate: 6, scale: 1.06 }} transition={{ type: "spring", stiffness: 300 }}>
        <LogoMark size={compact ? 30 : 38} />
      </motion.div>
      <div className="leading-tight">
        <div className={cn("font-extrabold tracking-wide", compact ? "text-sm" : "text-lg")}>
          Forgotten <span className="gradient-text">Cloud</span>
        </div>
        {!compact && (
          <div className="mono-label mt-0.5">local control plane · forgotten engine</div>
        )}
      </div>
    </div>
  );
}
