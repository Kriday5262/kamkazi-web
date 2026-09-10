import { cn } from "@/lib/utils";

/**
 * Kamkazi brand glyph — a sunrise-over-checkmark mark drawn with currentColor
 * so it flips automatically in dark mode (no image variants needed).
 * Wrap it on a gradient tile like the old logo for the sidebar header.
 */
export function BrandGlyph({ className }: { className?: string | undefined }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="Kamkazi"
      className={cn("shrink-0", className)}
      fill="none"
    >
      {/* sunrise arc */}
      <path
        d="M6 21.5a10 10 0 0 1 20 0"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      {/* sun rays */}
      <path
        d="M16 5.5v3.4M7.6 9.6l2.2 2.4M24.4 9.6l-2.2 2.4"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* checkmark rising from the horizon */}
      <path
        d="M10.5 21.5l3.8 3.8 7.6-8"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* horizon line */}
      <path d="M5 27.5h22" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** Sidebar / mobile-header tile: gradient background + white glyph, like before. */
export function BrandMark({ className }: { className?: string | undefined }) {
  return (
    <span
      className={cn(
        "gradient-primary grid size-8 shrink-0 place-items-center rounded-[10px] text-white shadow-[var(--shadow-3d)]",
        className,
      )}
    >
      <BrandGlyph className="size-5" />
    </span>
  );
}
