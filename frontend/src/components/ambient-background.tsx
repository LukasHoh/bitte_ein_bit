/**
 * Non-interactive full-viewport layer: gradient orbs + optional grid.
 * Use behind page content (content stays above via z-index).
 */
export function AmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 mesh-noise opacity-60" />
      <div
        className="absolute -left-32 top-0 h-[min(85vh,600px)] w-[min(85vw,600px)] rounded-full bg-primary/25 blur-[100px] animate-aurora"
        style={{ willChange: "transform" }}
      />
      <div
        className="absolute -right-20 top-1/3 h-[min(70vh,520px)] w-[min(70vw,520px)] rounded-full bg-primary-glow/20 blur-[90px] animate-aurora-slow"
        style={{ willChange: "transform" }}
      />
      <div
        className="absolute bottom-0 left-1/3 h-[40vh] w-[50vw] max-w-2xl rounded-full bg-accent/15 blur-[80px] animate-pulse-glow"
        style={{ willChange: "transform, opacity" }}
      />
    </div>
  );
}
