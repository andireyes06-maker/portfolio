"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Shippori_Mincho } from "next/font/google";

const shippori = Shippori_Mincho({
  variable: "--font-shippori-gateway",
  subsets: ["latin"],
  weight: ["400", "600", "800"],
});

// Same palette as /showcase (INK/PAPER/MUTED/ACCENT) — redefined locally
// rather than imported since the two routes are otherwise fully decoupled,
// but the values must match: this page's whole job is to feel like the
// threshold into that site, not a different one.
const INK = "#1c1a17";
const PAPER = "#f3efe6";
const MUTED = "#6b6355";
const ACCENT = "#b3402e";
const EASE = [0.16, 1, 0.32, 1] as const;

// Same technique as the Journey section's TEXT_HALO on /showcase (a soft
// blurred glow behind text instead of a flat scrim), just inverted for a
// dark backdrop: glow in INK behind PAPER text instead of the reverse.
const TEXT_HALO = "0 0 20px rgba(28,26,23,0.9), 0 0 10px rgba(28,26,23,0.85), 0 1px 3px rgba(28,26,23,0.95)";
// The eyebrow's thin uppercase tracking doesn't get much benefit from a wide
// soft blur (too little ink-density right at the hairline strokes) — a
// tighter, denser glow reads better at that weight than scaling TEXT_HALO up.
const TEXT_HALO_TIGHT = "0 0 3px rgba(28,26,23,1), 0 0 7px rgba(28,26,23,1), 0 1px 2px rgba(28,26,23,1)";

const GRAYSCALE_FILTER = "grayscale(90%) sepia(14%) saturate(70%) brightness(0.8)";
const COLOR_FILTER = "grayscale(0%) sepia(0%) saturate(100%) brightness(1)";

export default function Home() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [entering, setEntering] = useState(false);

  // Warms the route so the actual page swap after the bloom is instant
  // rather than waiting on a JS chunk fetch right when it matters most.
  useEffect(() => {
    router.prefetch("/showcase");
  }, [router]);

  const enter = useCallback(() => {
    if (entering) return;
    setEntering(true);
    // Reduced motion: skip the bloom, just a quick fade before navigating.
    // Full motion: bloom (~600ms) plus a beat for the cream cover to land
    // before the route actually swaps underneath it.
    const delay = reduceMotion ? 150 : 650;
    window.setTimeout(() => router.push("/showcase"), delay);
  }, [entering, reduceMotion, router]);

  return (
    <main
      className={shippori.className}
      style={{
        position: "relative",
        minHeight: "100dvh",
        overflow: "hidden",
        background: INK,
        color: PAPER,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      <style>{`
        .gateway-cta {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          padding: 18px 36px;
          background: ${ACCENT};
          color: ${PAPER};
          border: 1px solid ${ACCENT};
          font-size: clamp(15px, 1.5vw, 17px);
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: background 0.32s cubic-bezier(0.16, 1, 0.32, 1), color 0.32s cubic-bezier(0.16, 1, 0.32, 1);
        }
        .gateway-cta:hover,
        .gateway-cta:focus-visible {
          background: ${PAPER};
          color: ${ACCENT};
        }
        .gateway-cta:focus-visible {
          outline: 2px solid ${PAPER};
          outline-offset: 3px;
        }
        .gateway-cta:disabled {
          cursor: default;
        }
      `}</style>

      {/* Real hero illustration from /showcase, desaturated toward the
          site's paper tone rather than pure grayscale, and kept dark/behind
          via a low-key opacity + text halo instead of a scrim (the scrim
          approach already burned us once on the showcase hero itself). */}
      <motion.img
        aria-hidden
        src="/showcase/hero-bg.png"
        alt=""
        initial={false}
        animate={{ filter: entering && !reduceMotion ? COLOR_FILTER : GRAYSCALE_FILTER }}
        transition={{ duration: reduceMotion ? 0 : 0.6, ease: EASE }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "75% 50%",
          opacity: 0.6,
          pointerEvents: "none",
        }}
      />

      <motion.div
        animate={{ opacity: entering ? 0 : 1, y: entering && !reduceMotion ? -14 : 0 }}
        transition={{ duration: reduceMotion ? 0.15 : 0.4, ease: EASE }}
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 28,
          padding: "0 6vw",
          maxWidth: 640,
        }}
      >
        <div style={{ fontSize: 13, letterSpacing: "0.35em", textShadow: TEXT_HALO_TIGHT }}>
          <span style={{ color: ACCENT }}>桜:</span> <span style={{ color: PAPER }}>FRANZ ADRIENE ACLON</span>
        </div>
        {/* PLACEHOLDER — final headline copy TBD, flagged for approval. */}
        <h1
          style={{
            margin: 0,
            fontSize: "clamp(34px, 5vw, 58px)",
            fontWeight: 800,
            letterSpacing: "0.02em",
            lineHeight: 1.15,
            textShadow: TEXT_HALO,
          }}
        >
          The full picture is in color.
        </h1>
        <button type="button" onClick={enter} disabled={entering} className="gateway-cta">
          <span>Enter the showcase</span>
          <span aria-hidden>→</span>
        </button>
        {/* PLACEHOLDER — final tagline copy TBD, per the brief's own note. */}
        <div style={{ fontSize: 13, fontStyle: "italic", letterSpacing: "0.02em", color: "rgba(243,239,230,0.65)", textShadow: TEXT_HALO_TIGHT }}>
          grayscale, until you cross over
        </div>
      </motion.div>

      {/* Lands at the same PAPER cream the showcase's own loader opens on,
          so the route swap underneath happens between two matching solid
          frames instead of reading as a visible cut. */}
      <motion.div
        aria-hidden
        initial={false}
        animate={{ opacity: entering ? 1 : 0 }}
        transition={{ duration: reduceMotion ? 0.15 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.3 }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          background: PAPER,
          pointerEvents: entering ? "auto" : "none",
        }}
      />
    </main>
  );
}
