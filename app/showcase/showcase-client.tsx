"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  motion,
  AnimatePresence,
  MotionConfig,
  useScroll,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "motion/react";
import { ChevronLeft, ChevronRight, ImagePlus, Mail, Maximize2, Menu, X } from "lucide-react";
import { DialRoot, useDialKit } from "dialkit";
import "dialkit/styles.css";
import { TransitionLink } from "@/components/transition-link";

/**
 * The site's one hand-tuned motion curve — same ease used by the ink-wash
 * page-transition cover/reveal (components/page-transition.tsx: a decisive
 * fast-start, hard-settle curve, the shape of a brush stroke landing rather
 * than a mechanical ease-in-out). Reused for every "arriving" transition
 * sitewide — reveals, hovers, the modal — so nothing invents its own
 * one-off easing. Previously scoped to just the modal as MODAL_EASE;
 * broadened here as the same choreography now spans hovers and reveals too.
 */
const INK_EASE = [0.16, 1, 0.32, 1] as const;
/**
 * Base tempo unit, matched to the nav wash's own round trip (180ms cover +
 * 230ms reveal ≈ 410ms) rather than picked arbitrarily — other transitions
 * scale off this so the whole site shares one pace instead of the previous
 * mix of 0.25s/0.5s/0.8s/0.9s/2.8s with no relationship to each other.
 */
const INK_DURATION = 0.42;
/** Stagger unit for "illustration settles, then text follows" reveals —
 * short enough to read as pacing, not a SaaS list-animation gimmick. */
const INK_STAGGER = 0.14;

const INK = "#1c1a17";
const PAPER = "#f3efe6";
const MUTED = "#6b6355";
const ACCENT = "#b3402e";

const NAME = "Franz Adriene Aclon";
const CONTACT_EMAIL = "andireyes06@gmail.com";

/**
 * Shared vertical rhythm for every full-bleed content section (About,
 * Skills, Works, Origins, Learning curve). Before this, each section's
 * top/bottom padding had drifted independently (130/140/120+100px) with no
 * relationship to each other, so section-to-section transitions felt
 * randomly tight or loose rather than one paced rhythm. Contact
 * intentionally stays outside this constant (160px) as the one deliberate
 * exception — it's the page's closing section and was already given extra
 * weight on purpose; Hero and the pinned Journey/samurai section are
 * viewport-height-driven and not part of this padding system at all.
 */
const SECTION_PAD = "140px 6vw";

/**
 * One shared pill treatment for every tag across the site (core skills,
 * "currently learning", and project tags) — same size/padding/letter-
 * spacing/border-radius everywhere, so they read as one design decision.
 * "dashed" is the only sanctioned variant: visually lighter/secondary
 * (in-progress skills) without breaking from the shared sizing.
 */
function tagPillStyle(variant: "solid" | "dashed" = "solid"): React.CSSProperties {
  return {
    fontSize: 12,
    letterSpacing: "0.12em",
    padding: "5px 12px",
    borderRadius: 0,
    color: INK,
    border: variant === "dashed" ? `1px dashed ${MUTED}` : `1px solid ${INK}`,
  };
}

// Soft paper-colored halo so the journey copy stays legible where it
// crosses the dark samurai illustration, without a hard box edge.
const TEXT_HALO =
  "0 0 16px rgba(243,239,230,0.85), 0 0 8px rgba(243,239,230,0.85), 0 1px 2px rgba(243,239,230,0.9)";

const PETAL_SOURCES = [
  "/showcase/petals/petal-1.png",
  "/showcase/petals/petal-2.png",
  "/showcase/petals/petal-3.png",
  "/showcase/petals/petal-4.png",
  "/showcase/petals/petal-5.png",
];

// Module-level cache: every PetalCanvas instance (hero + journey) shares the
// same five images instead of each mounting its own duplicate fetch.
let petalImageCache: HTMLImageElement[] | null = null;
function getPetalImages() {
  if (!petalImageCache) {
    petalImageCache = PETAL_SOURCES.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
  }
  return petalImageCache;
}

/**
 * Park-Miller minimal-standard PRNG (seed 7). Ported straight from the
 * original design source rather than Math.random() — a fresh seed each
 * mount would still look like petals, but this is what "the real thing"
 * actually used.
 */
function createRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function drawPetal(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  rot: number,
  size: number,
  alpha: number
) {
  if (!img.complete || !img.naturalWidth || alpha <= 0) return;
  const h = size * (img.naturalHeight / img.naturalWidth);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.drawImage(img, -size / 2, -h / 2, size, h);
  ctx.restore();
}

/**
 * Falling sakura petals — two independent systems layered together, ported
 * from the original design source:
 *  - Ambient: continuous, time-driven only, wraps seamlessly. Runs always.
 *  - Sweep: only when `scrollProgress` is passed (the Journey section) —
 *    motion is a pure function of scroll progress, smoothed toward the
 *    live value each frame so petals keep drifting for a moment after
 *    scrolling stops instead of snapping to a stop.
 * Skips entirely under prefers-reduced-motion.
 */
function PetalCanvas({
  density = 1,
  scrollProgress,
  petalDrift = 1,
}: {
  density?: number;
  scrollProgress?: MotionValue<number>;
  /** Sweep horizontal-speed multiplier — matches the original's "Petals" dial (default 1, range 0.5-2). */
  petalDrift?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useReducedMotion();
  // reduceMotion resolves synchronously on the client (null only during SSR),
  // so branching render output on it directly would mismatch the server's
  // HTML. Gate behind a mounted flag that only flips post-hydration.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard hydration-safe "mounted" flag; removing this reintroduces the SSR/client mismatch above.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (reduceMotion) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let running = false;
    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const images = getPetalImages();
    const rnd = createRng(7);

    const ambientCount = Math.round(22 * density);
    const ambient = Array.from({ length: ambientCount }, () => ({
      img: Math.floor(rnd() * 5),
      x: rnd(),
      y: rnd(),
      vx: 0.01 + rnd() * 0.025,
      vy: 0.007 + rnd() * 0.018,
      size: 10 + rnd() * 24,
      spinV: (rnd() - 0.5) * 70,
      rot0: rnd() * 360,
      wobAmp: 8 + rnd() * 18,
      wobFreq: 0.3 + rnd() * 0.7,
      wobPhase: rnd() * Math.PI * 2,
      alpha: 0.25 + rnd() * 0.35,
    }));

    const sweep = scrollProgress
      ? Array.from({ length: 120 }, () => {
          const size = 14 + rnd() * 38;
          // 0 (smallest) -> 1 (largest); ties wobble amplitude and opacity to
          // size for a depth-of-field feel — small petals read as farther away.
          const depth = (size - 14) / 38;
          return {
            img: Math.floor(rnd() * 5),
            start: rnd(),
            y0: rnd(),
            drift: 0.25 + rnd() * 0.75,
            driftDir: rnd() < 0.5 ? -1 : 1,
            speed: 0.9 + rnd() * 1.4,
            size,
            spin: (rnd() - 0.5) * 900,
            rot0: rnd() * 360,
            wobAmp: (4 + depth * 24) * (0.7 + rnd() * 0.6),
            wobFreq: 0.5 + rnd() * 1.2,
            wobPhase: rnd() * Math.PI * 2,
            alpha: (0.35 + depth * 0.55) * (0.8 + rnd() * 0.3),
          };
        })
      : [];
    let petalPSmooth = 0;

    const tick = (ts: number) => {
      const time = ts / 1000;
      ctx.clearRect(0, 0, width, height);

      for (const pt of ambient) {
        const px = (((pt.x - time * pt.vx) % 1.2) + 1.2) % 1.2 - 0.1;
        const py = (((pt.y + time * pt.vy) % 1.2) + 1.2) % 1.2 - 0.1;
        const x = px * width;
        const y = py * height + Math.sin(time * pt.wobFreq + pt.wobPhase) * pt.wobAmp;
        const rot = ((pt.rot0 + pt.spinV * time) * Math.PI) / 180;
        drawPetal(ctx, images[pt.img], x, y, rot, pt.size, pt.alpha);
      }

      if (scrollProgress) {
        petalPSmooth += (scrollProgress.get() - petalPSmooth) * 0.12;
        const p = petalPSmooth;
        for (const pt of sweep) {
          const t = ((p * petalDrift - pt.start * 0.9) / 0.55) * pt.speed;
          if (t <= 0 || t >= 1.15) continue;
          const te = 1 - (1 - t) * (1 - t); // ease-out: fast start, settles near the end of the fall
          const x = width + 60 - te * (width + 220);
          const baseY =
            pt.y0 * height + pt.driftDir * pt.drift * t * height * 0.5 + t * t * height * 0.08;
          const y =
            baseY +
            Math.sin(time * pt.wobFreq + pt.wobPhase) * pt.wobAmp +
            Math.sin(t * 9 + pt.wobPhase) * pt.wobAmp * 0.8;
          const rot =
            ((pt.rot0 + pt.spin * t + Math.sin(time * pt.wobFreq * 1.3 + pt.wobPhase) * 18) * Math.PI) / 180;
          const fade = t < 0.08 ? t / 0.08 : t > 1 ? Math.max(0, 1 - (t - 1) / 0.15) : 1;
          drawPetal(ctx, images[pt.img], x, y, rot, pt.size, pt.alpha * fade);
        }
      }

      if (running) raf = requestAnimationFrame(tick);
    };

    // The page can hold several PetalCanvas instances at once (hero, journey,
    // each chapter section). Without this, every instance keeps clearing,
    // redrawing, and compositing at full rate even while scrolled far out of
    // view — that off-screen paint/composite cost (not the per-petal script,
    // which is cheap) is what was actually driving the scroll jank.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!running) {
            running = true;
            raf = requestAnimationFrame(tick);
          }
        } else {
          running = false;
          cancelAnimationFrame(raf);
        }
      },
      { rootMargin: "200px 0px" }
    );
    io.observe(canvas);

    return () => {
      io.disconnect();
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [density, reduceMotion, scrollProgress, petalDrift]);

  if (mounted && reduceMotion) return null;

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        mixBlendMode: "multiply",
        pointerEvents: "none",
      }}
    />
  );
}

interface SectionIllustrationProps {
  src: string;
  alt: string;
  maxWidth?: number;
}

/**
 * Reusable slot for a full sumi-e/watercolor illustration in a
 * ChapterSection's right-hand column (the torii gate now, a matching
 * mountain piece for "Learning curve" later). Width-capped with height
 * auto so portrait artwork scales without ever being cropped, and sized
 * well past icon scale — these have real ink texture, petals, and birds
 * that need to actually read.
 */
function SectionIllustration({ src, alt, maxWidth = 420 }: SectionIllustrationProps) {
  return <img src={src} alt={alt} style={{ display: "block", width: "100%", maxWidth, height: "auto" }} />;
}

interface ChapterSectionProps {
  id?: string;
  kanji: string;
  title: string;
  body: string;
  motif: React.ReactNode;
  tags?: string[];
  /** Short scannable achievements, rendered as an accent-marked list below the body copy. */
  highlights?: string[];
  /** A second, visually lighter tag group (dashed/muted instead of solid) for
   *  things that are in progress rather than settled — e.g. Skills' "currently
   *  learning" row. Kept distinct from `tags` so the two read as different
   *  claims (proven vs. in-progress), not one flat list. */
  secondaryTags?: { label: string; items: string[] };
  /** A single differentiator worth calling out on its own line rather than
   *  folding into the tag list — e.g. Skills' "AI-assisted development". */
  callout?: string;
  /** Swaps the text/illustration column order — same alternating pattern as WorkRow — so consecutive chapters don't read as a copy-pasted template. */
  reverse?: boolean;
}

function ChapterSection({ id, kanji, title, body, motif, tags, highlights, secondaryTags, callout, reverse = false }: ChapterSectionProps) {
  return (
    <section id={id} style={{ position: "relative", overflow: "hidden", background: PAPER, color: INK, padding: SECTION_PAD }}>
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "-10vh",
          right: "-3vw",
          fontSize: "clamp(240px, 30vw, 480px)",
          fontWeight: 800,
          color: "rgba(28, 26, 23, 0.04)",
          lineHeight: 1,
          userSelect: "none",
        }}
      >
        {kanji}
      </div>
      <PetalCanvas density={0.35} />
      <div
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: "clamp(32px, 5vw, 80px)",
          alignItems: "stretch",
        }}
        data-about-grid
      >
        {/* Illustration settles first — as if painted — then the copy
            follows a beat later, as if written after. Two separately
            staggered reveals instead of one shared fade so the sequence
            reads as composition, not a single generic block arriving. */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10% 0px" }}
          transition={{ duration: INK_DURATION, ease: INK_EASE, delay: INK_STAGGER }}
          style={{ display: "flex", flexDirection: "column", gap: 24, justifyContent: "center", order: reverse ? 2 : 0 }}
        >
          <div style={{ fontSize: 15, letterSpacing: "0.4em", color: ACCENT }}>{kanji}</div>
          <h2 style={{ margin: 0, fontSize: "clamp(32px, 3.6vw, 48px)", fontWeight: 800, letterSpacing: "0.04em" }}>
            {title}
          </h2>
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.85, color: "#443f36", maxWidth: "52ch" }}>{body}</p>
          {highlights && (
            <ul style={{ display: "flex", flexDirection: "column", gap: 12, margin: 0, padding: 0, listStyle: "none", maxWidth: "48ch" }}>
              {highlights.map((h) => (
                <li key={h} style={{ display: "flex", gap: 12, fontSize: 15, lineHeight: 1.6, color: "#443f36" }}>
                  <span aria-hidden style={{ flexShrink: 0, width: 6, height: 6, borderRadius: "50%", background: ACCENT, marginTop: 8 }} />
                  {h}
                </li>
              ))}
            </ul>
          )}
          {tags && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {tags.map((tag) => (
                <span key={tag} style={tagPillStyle("solid")}>
                  {tag}
                </span>
              ))}
            </div>
          )}
          {secondaryTags && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.2em", color: MUTED, textTransform: "uppercase" }}>
                {secondaryTags.label}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {secondaryTags.items.map((tag) => (
                  <span
                    key={tag}
                    style={tagPillStyle("dashed")}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
          {callout && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, fontSize: 12, letterSpacing: "0.15em", color: ACCENT, textTransform: "uppercase" }}>
              <span aria-hidden style={{ flexShrink: 0, width: 6, height: 6, borderRadius: "50%", background: ACCENT }} />
              {callout}
            </div>
          )}
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-10% 0px" }}
          transition={{ duration: INK_DURATION, ease: INK_EASE }}
          style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", order: reverse ? 1 : 0 }}
        >
          {motif}
        </motion.div>
      </div>
    </section>
  );
}

/**
 * Plain clamped linear interpolation, used instead of `useTransform`'s
 * array-range overload for every scroll-linked value below. That overload
 * makes Framer Motion offload the animation to a native CSS ViewTimeline
 * when the browser supports it — a fast path, but for a sub-range keyframe
 * (e.g. [0.03, 0.28]) chained off a `useScroll` target whose tracked
 * container is much taller than the viewport (our 320vh pinned section),
 * the browser's native "contain" timeline range diverges from Framer's own
 * "start start"/"end end" math well before scroll progress reaches 1 —
 * the value silently un-reveals back toward its start instead of holding.
 * Passing a plain function to `useTransform` opts out of that native path
 * (confirmed against Framer Motion's source: the accelerate hookup is
 * skipped whenever the second argument isn't an array), so it always runs
 * the same main-thread math whose correctness we've verified directly.
 */
function clampedLerp(value: number, inputStart: number, inputEnd: number, outputStart: number, outputEnd: number) {
  const t = inputEnd === inputStart ? (value < inputStart ? 0 : 1) : (value - inputStart) / (inputEnd - inputStart);
  const clampedT = Math.min(1, Math.max(0, t));
  return outputStart + (outputEnd - outputStart) * clampedT;
}

function JourneySection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  // Dev-only tuning panel for the scroll choreography below — hidden
  // automatically in production builds (DialRoot's productionEnabled
  // defaults to false). Sliders mirror the exact numbers this section
  // used to hardcode, so the feel can be tuned live instead of
  // guess-rebuild-eyeball.
  const dial = useDialKit("Journey Scroll", {
    shapeRight: {
      xStart: [40, -50, 150],
      xEnd: [-100, -200, 50],
      oStart: [0.5, 0, 1],
      oEnd: [0.85, 0, 1],
    },
    shapeLeft: {
      xStart: [-40, -150, 50],
      xEnd: [70, -50, 200],
      oStart: [0.4, 0, 1],
      oEnd: [0.75, 0, 1],
    },
    samurai: {
      progressStart: [0.03, 0, 0.5, 0.01],
      progressEnd: [0.28, 0, 0.6, 0.01],
      xStart: [100, 0, 300],
    },
    textReveal: {
      line1Start: [0.12, 0, 0.5, 0.01],
      line2Start: [0.47, 0, 0.7, 0.01],
      line3Start: [0.79, 0, 0.9, 0.01],
      windowSize: [0.12, 0.02, 0.3, 0.01],
      yOffset: [24, 0, 60],
    },
    petals: {
      drift: [1, 0.5, 2, 0.1],
    },
  });

  const shapeRightX = useTransform(scrollYProgress, (v) => clampedLerp(v, 0, 1, dial.shapeRight.xStart, dial.shapeRight.xEnd));
  const shapeRightO = useTransform(scrollYProgress, (v) => clampedLerp(v, 0, 1, dial.shapeRight.oStart, dial.shapeRight.oEnd));
  const shapeLeftX = useTransform(scrollYProgress, (v) => clampedLerp(v, 0, 1, dial.shapeLeft.xStart, dial.shapeLeft.xEnd));
  const shapeLeftO = useTransform(scrollYProgress, (v) => clampedLerp(v, 0, 1, dial.shapeLeft.oStart, dial.shapeLeft.oEnd));

  const samuraiX = useTransform(scrollYProgress, (v) =>
    clampedLerp(v, dial.samurai.progressStart, dial.samurai.progressEnd, dial.samurai.xStart, 0)
  );
  const samuraiO = useTransform(scrollYProgress, (v) =>
    clampedLerp(v, dial.samurai.progressStart, dial.samurai.progressEnd, 0, 1)
  );

  const line1Start = dial.textReveal.line1Start;
  const line2Start = dial.textReveal.line2Start;
  const line3Start = dial.textReveal.line3Start;
  const windowSize = dial.textReveal.windowSize;
  const yOffset = dial.textReveal.yOffset;

  const line1O = useTransform(scrollYProgress, (v) => clampedLerp(v, line1Start, line1Start + windowSize, 0, 1));
  const line1Y = useTransform(scrollYProgress, (v) => clampedLerp(v, line1Start, line1Start + windowSize, yOffset, 0));
  const line2O = useTransform(scrollYProgress, (v) => clampedLerp(v, line2Start, line2Start + windowSize, 0, 1));
  const line2Y = useTransform(scrollYProgress, (v) => clampedLerp(v, line2Start, line2Start + windowSize, yOffset, 0));
  const line3O = useTransform(scrollYProgress, (v) => clampedLerp(v, line3Start, line3Start + windowSize, 0, 1));
  const line3Y = useTransform(scrollYProgress, (v) => clampedLerp(v, line3Start, line3Start + windowSize, yOffset, 0));

  return (
    // 260vh (was 320vh, dating from when this section opened the page rather
    // than closing the arc right before Contact): the old height left the
    // last text line fully revealed by progress 0.76 but pinned all the way
    // to 1.0, so ~23% of the pin (roughly half a screen height) sat frozen
    // with nothing changing before the section released into Contact — read
    // as a dead gap. line3Start now finishes near the end of the (shorter)
    // pin instead of a quarter of it early.
    <section ref={containerRef} style={{ height: "260vh", position: "relative", background: PAPER }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          overflow: "hidden",
          background: `url("/showcase/journey-bg.png") center / cover no-repeat, ${PAPER}`,
        }}
      >
        {/* journey-bg.png is 1408x768 — at most desktop viewport heights,
            `cover` scales it so its own height matches the container almost
            exactly, leaving no vertical crop margin. That puts the asset's
            baked-in torn-paper edge (and its lighter halo) right at the
            section boundary as a hard seam. Fade it into the flat PAPER
            color on both edges instead of cropping it away. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "16vh",
            background: `linear-gradient(to bottom, ${PAPER}, rgba(243,239,230,0))`,
            pointerEvents: "none",
          }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "16vh",
            background: `linear-gradient(to top, ${PAPER}, rgba(243,239,230,0))`,
            pointerEvents: "none",
          }}
        />
        <motion.img
          src="/showcase/journey-shape-right.png"
          alt=""
          style={{
            position: "absolute",
            right: "-6vw",
            top: "4vh",
            width: "46vw",
            mixBlendMode: "multiply",
            pointerEvents: "none",
            x: shapeRightX,
            opacity: shapeRightO,
          }}
        />
        <motion.img
          src="/showcase/journey-shape-left.png"
          alt=""
          style={{
            position: "absolute",
            left: "-9vw",
            bottom: "6vh",
            width: "42vw",
            mixBlendMode: "multiply",
            pointerEvents: "none",
            x: shapeLeftX,
            opacity: shapeLeftO,
          }}
        />
        <motion.img
          src="/showcase/samurai.png"
          alt="Samurai standing beneath a cherry tree"
          data-journey-samurai
          style={{
            position: "absolute",
            right: "7vw",
            bottom: 0,
            height: "80vh",
            mixBlendMode: "multiply",
            x: samuraiX,
            opacity: samuraiO,
          }}
        />

        <PetalCanvas density={0.8} scrollProgress={scrollYProgress} petalDrift={dial.petals.drift} />

        <div
          data-journey-text
          style={{
            position: "absolute",
            left: "7vw",
            top: "50%",
            transform: "translateY(-50%)",
            width: "min(460px, 42vw)",
            display: "flex",
            flexDirection: "column",
            gap: 56,
            fontFamily: "var(--font-shippori), serif",
            color: INK,
          }}
        >
          <motion.div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: line1O, y: line1Y }}>
            <div style={{ fontSize: 13, letterSpacing: "0.4em", color: ACCENT }}>一</div>
            <div style={{ fontSize: "clamp(22px, 2.2vw, 30px)", fontWeight: 600, lineHeight: 1.5, textShadow: TEXT_HALO, maxWidth: "100%", overflowWrap: "break-word" }}>
              Code, placed like brush strokes: deliberate, spare, exact.
            </div>
          </motion.div>
          <motion.div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: line2O, y: line2Y }}>
            <div style={{ fontSize: 13, letterSpacing: "0.4em", color: ACCENT }}>二</div>
            <div style={{ fontSize: "clamp(22px, 2.2vw, 30px)", fontWeight: 600, lineHeight: 1.5, textShadow: TEXT_HALO, maxWidth: "100%", overflowWrap: "break-word" }}>
              Stillness is a discipline. Fewer moving parts, fewer regrets.
            </div>
          </motion.div>
          <motion.div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: line3O, y: line3Y }}>
            <div style={{ fontSize: 13, letterSpacing: "0.4em", color: ACCENT }}>三</div>
            <div style={{ fontSize: "clamp(22px, 2.2vw, 30px)", fontWeight: 600, lineHeight: 1.5, textShadow: TEXT_HALO, maxWidth: "100%", overflowWrap: "break-word" }}>
              The work speaks quietly.
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

interface ProjectImage {
  src: string;
  alt: string;
}

/** A single annotation dot over a `SitePreview` screenshot, positioned by
 *  percentage so it stays correctly placed regardless of the rendered
 *  image's display size. Only ever shown over `pages[0]` — see `SitePreview`
 *  below for why. */
interface SiteHotspot {
  xPct: number;
  yPct: number;
  label: string;
  note: string;
}

/** A "simulated live browse" for a project whose real site can't be
 *  iframed (blocked via X-Frame-Options/CSP) — tab buttons swap between
 *  real screenshots of actual site pages instead of a truly live embed.
 *  `hotspots` are only ever rendered over `pages[0]` (the default tab):
 *  positioning them accurately across every page × every scroll offset
 *  would need real scroll tracking a static screenshot can't provide, and
 *  the site's own home page is where the annotated moments actually live. */
interface SitePreview {
  pages: { label: string; url: string; image: ProjectImage }[];
  hotspots?: SiteHotspot[];
}

interface WorkItem {
  title: string;
  description: string;
  tags?: string[];
  link?: { label: string; href: string };
  image?: ProjectImage;
  /** Case-study detail rendered in the click-to-expand modal. Hero shot
   *  first, then whatever additional detail shots exist — the modal just
   *  stacks whatever's here, so adding a screenshot later is a one-line
   *  push, no component changes. Falls back to `image` alone if omitted. */
  gallery?: ProjectImage[];
  /** Longer case-study copy for the modal. Falls back to `description` if omitted. */
  expandedDescription?: string;
  role?: string;
  outcome?: string;
  /** Rendered verbatim in the modal's metadata strip (e.g. "Jan-Mar 2026"). Omitted
   *  entirely — never guessed — when not known; the strip just drops that item. */
  timeline?: string;
  /** Overrides the metadata strip's default "Live"-if-`link`-else-"Case study"
   *  logic — for projects that are genuinely live but have no public URL to
   *  send a visitor to (an internal automation, say), so status doesn't end
   *  up misreported as "Case study" for want of a link, or force a fake one.
   *  "Internal tool" covers the case where "Live" would overstate it — a
   *  backend pipeline built for one client's internal use, not something
   *  anyone visits. */
  status?: "Live" | "Case study" | "Internal tool";
  /** Embeds the real, live tool in an iframe, positioned above the screenshot
   *  gallery rather than replacing it. Only set this after confirming the
   *  target's response headers don't block framing (X-Frame-Options / CSP
   *  frame-ancestors) — see the Burnout Force Check entry below. */
  liveEmbed?: { src: string; title: string };
  /** Replaces both `liveEmbed` and the plain screenshot gallery in the modal
   *  with a tabbed, hotspot-annotated preview — for a site that's real and
   *  live but can't be iframed (see the Higher Performance Group Website
   *  entry below for why). */
  sitePreview?: SitePreview;
  /** No image slot is rendered for these — there's no pending screenshot to speak of, just nothing shipped yet. */
  isComingSoon?: boolean;
}

const works: WorkItem[] = [
  {
    title: "TQ Assessment",
    description:
      "A full web application built to run the client's leadership assessment end to end: its own database, scoring, and reporting.",
    // PLACEHOLDER COPY — role/outcome fabricated for layout review, swap for specifics.
    expandedDescription:
      "Built from scratch to replace an ad hoc spreadsheet process: the client needed a proper assessment instrument that could take a team through 57 questions across six dimensions, score the results, and turn them into something a leadership team could actually act on, not just a raw number.",
    role: "Solo build: schema design, scoring logic, and the assessment UI end to end.",
    outcome: "Replaced a manual, spreadsheet-driven process with a self-serve tool the client now runs independently.",
    tags: ["Web application", "Database", "Netlify", "Airtable", "JavaScript"],
    image: { src: "/showcase/tq_assessment.png", alt: "Screenshot of the TQ Team Intelligence Assessment landing screen" },
    gallery: [{ src: "/showcase/tq_assessment.png", alt: "Screenshot of the TQ Team Intelligence Assessment landing screen" }],
  },
  {
    title: "Burnout Force Check",
    description:
      "A free assessment tool built for Higher Performance Group's clients. Automated end to end, from response to follow-up.",
    expandedDescription:
      "A short, public-facing structural read on a team's burnout risk, built to sit directly on the client's marketing site as a lead-generation tool. The backend runs on Netlify Functions with no server to manage; results are scored on submission, delivered by email through an ActiveCampaign-connected pipeline, and logged to Airtable for the client's own follow-up. An automated test suite guards the respondent-facing logic: what a given answer pattern is allowed to reveal, and when, since this ships straight to the public with no manual QA pass in between.",
    role: "Solo build: serverless backend, CRM integration, and the automated test suite.",
    outcome: "Live on the client's site as an active lead-generation tool, feeding their CRM directly.",
    tags: ["Netlify", "Airtable", "ActiveCampaign", "AI Automation"],
    // Was "https://burnoutforce-higherperformancegroup.com" (hyphenated) — that host
    // doesn't resolve (NXDOMAIN). The real live tool is a subdomain, confirmed via
    // `host burnoutforce.higherperformancegroup.com`, and its response carries no
    // X-Frame-Options or CSP frame-ancestors header, so it's safe to iframe below.
    link: { label: "VIEW PROJECT", href: "https://burnoutforce.higherperformancegroup.com" },
    liveEmbed: { src: "https://burnoutforce.higherperformancegroup.com", title: "Burnout Force Check — live tool" },
    image: { src: "/showcase/burnout_force.png", alt: "Screenshot of the Burnout Force Check landing page" },
    // Explicitly empty (not omitted) — the live embed above already covers
    // this project's modal, so a static screenshot under it would just be
    // redundant. `work.image` above still supplies the card thumbnail on
    // the works list. Push new screenshots here whenever there are more.
    gallery: [],
  },
  {
    // PLACEHOLDER COPY — repurposed from the old "More soon" slot since
    // there's no other project queued; swap for real specifics before ship.
    title: "Higher Performance Group Website",
    description:
      "The client's public-facing marketing site, rebuilt from their design into a working, maintainable site.",
    expandedDescription:
      "The client's primary marketing site: the front door for everything else in this list, from the assessment tools to the books and speaking engagements. Built to carry a consistent brand voice across every page while staying easy for the client's own team to extend.",
    role: "Solo build: site architecture, page templates, and content structure.",
    tags: ["Marketing site"],
    link: { label: "VIEW PROJECT", href: "https://higherperformancegroup.com" },
    // Card thumbnail on the Selected Works list only — the modal below
    // replaces this with sitePreview entirely, no static screenshot there.
    image: { src: "/showcase/hpg_website.png", alt: "Screenshot of the Higher Performance Group marketing website homepage" },
    // Explicitly empty: a true live iframe was attempted first (see
    // sitePreview comment below for why it's blocked) and no static
    // screenshot fallback is kept in the modal per the no-image-fallback
    // requirement — sitePreview.pages is what actually renders there.
    gallery: [],
    // higherperformancegroup.com sends `X-Frame-Options: SAMEORIGIN` and
    // `Content-Security-Policy: frame-ancestors 'self'` on every path
    // (confirmed via curl against /, /bookstore, /tq-assessment, and a
    // handful of others — same headers everywhere, so it's a platform-level
    // default from Duda, not a one-page config). That rules out a real
    // iframe embed entirely. This is a simulated substitute instead: real
    // screenshots of the actual live pages (captured directly from
    // higherperformancegroup.com, not mocked up), swapped by the tabs
    // below, with hotspots called out on the home tab only — see
    // `SitePreview`'s own comment for why hotspots don't follow tabs/scroll.
    sitePreview: {
      pages: [
        {
          label: "Home",
          url: "https://www.higherperformancegroup.com/",
          image: { src: "/showcase/hpg-preview-home.png", alt: "Higher Performance Group homepage: hero, trusted-by logo bar, and the Burnout Force Check companion assessment CTA" },
        },
        {
          label: "Solutions",
          url: "https://www.higherperformancegroup.com/tq-assessment",
          image: { src: "/showcase/hpg-preview-solutions.png", alt: "Higher Performance Group Team Intelligence Assessment solutions page" },
        },
        {
          label: "Books & More",
          url: "https://www.higherperformancegroup.com/bookstore",
          image: { src: "/showcase/hpg-preview-books.png", alt: "Higher Performance Group bookstore page featuring Dr. Joe Hill's books" },
        },
      ],
      hotspots: [
        {
          xPct: 50,
          yPct: 50.8,
          label: "FIND YOUR STARTING POINT",
          note: "Hero CTA — scrolls straight to the solutions section, the site's main path from “convinced” to “choosing a starting point.”",
        },
        {
          xPct: 11.7,
          yPct: 65.3,
          label: "Trusted by",
          note: "Logo bar of real institutions HPG has worked with, placed right under the fold to back up the hero's claim immediately.",
        },
        {
          xPct: 85.2,
          yPct: 90.3,
          label: "Companion assessment CTA",
          note: "This CTA links directly to the Burnout Force Check tool, also built as part of this engagement.",
        },
      ],
    },
  },
  {
    // Real copy (was placeholder). No public URL for an internal
    // automation, hence `status` set explicitly rather than via `link`.
    title: "AI Automation in ActiveCampaign",
    description:
      "A multi-step automation triggered when a lead's tag confirms an intro meeting is done. The sequence sends a scheduling email, waits seven days, checks whether the contact has booked a call, and follows up automatically if they haven't. A second wait-and-check loop follows for contacts still unscheduled. Built in ActiveCampaign's visual automation builder, with open and click-through tracking on every send.",
    tags: ["ActiveCampaign", "Automation", "Conditional logic"],
    status: "Live",
    // Real screenshot of the automation's branching-logic canvas. The
    // per-email send/open/click-through counts visible in the original
    // capture were redacted (solid rectangles matching the automation
    // builder's own card background, applied via `sharp`) before this file
    // ever entered the repo — the client's actual performance numbers stay
    // private; only the flow structure itself (trigger, sends, waits,
    // yes/no branches) is shown.
    image: { src: "/showcase/ac-automation-flow.png", alt: "ActiveCampaign automation builder canvas showing the scheduling-recording email sequence: trigger, email sends, wait steps, and conditional yes/no branches" },
    gallery: [{ src: "/showcase/ac-automation-flow.png", alt: "ActiveCampaign automation builder canvas showing the scheduling-recording email sequence: trigger, email sends, wait steps, and conditional yes/no branches" }],
  },
  {
    // Real copy (was placeholder) — this is the ninie-work-zoho/zohoimport.js
    // project: a Google Apps Script pipeline that resolves institution
    // websites, runs a multi-provider AI chain (Claude primary,
    // Mistral/Groq/Cohere fallback) to extract and validate contact data,
    // classifies institutions into market tiers, and pushes qualified
    // accounts/contacts into Zoho CRM in batches.
    title: "Healthcare Contact Scraper & CRM Pipeline",
    description:
      "A multi-stage pipeline for building a verified healthcare contact database: resolves institution websites automatically, classifies each into market tiers (bed count, VA facilities, multi-hospital systems), and pushes qualified accounts directly into Zoho CRM in batches. Includes a dedicated review tab for rejecting entries without sufficient evidence, keeping the final dataset clean rather than just large.",
    tags: ["Google Sheets", "Google Apps Script", "Zoho CRM", "Data pipeline"],
    status: "Internal tool",
    // Dashboard sidebar (Website Resolution / Market Segmentation / Zoho
    // Import / Contact Import controls), provided with the spreadsheet's
    // data grid and sheet-tab bar already blurred out by the client-side
    // source — deliberately, since the underlying rows are real people's
    // names, titles, emails, and phone numbers scraped from real hospitals.
    // That blur is preserved exactly as provided; this file is used as-is,
    // untouched, no sharpening/upscaling/reconstruction of any kind.
    image: { src: "/showcase/healthcare_scraper_blurred.png", alt: "Healthcare Contact Scraper dashboard sidebar showing Website Resolution, Market Segmentation, Zoho Import, and Contact Import controls, with the underlying spreadsheet data grid blurred to protect real contact information" },
    gallery: [{ src: "/showcase/healthcare_scraper_blurred.png", alt: "Healthcare Contact Scraper dashboard sidebar showing Website Resolution, Market Segmentation, Zoho Import, and Contact Import controls, with the underlying spreadsheet data grid blurred to protect real contact information" }],
  },
];

function ComingSoonRow({ work }: { work: WorkItem }) {
  return (
    <motion.div
      data-work-row
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: INK_DURATION, ease: INK_EASE }}
      style={{
        border: `1px dashed ${MUTED}`,
        padding: "48px 32px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 10,
      }}
    >
      <div style={{ fontSize: 15, letterSpacing: "0.4em", color: ACCENT }}>三</div>
      <h3 style={{ margin: 0, fontSize: "clamp(20px, 2vw, 26px)", fontWeight: 800, color: MUTED }}>{work.title}</h3>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: MUTED }}>{work.description}</p>
    </motion.div>
  );
}

function WorkRow({ work, reverse, onOpen }: { work: WorkItem; reverse: boolean; onOpen: (work: WorkItem, trigger: HTMLElement) => void }) {
  if (work.isComingSoon) return <ComingSoonRow work={work} />;

  const thumbStyle: React.CSSProperties = {
    position: "relative",
    aspectRatio: "16 / 10",
    overflow: "hidden",
    order: reverse ? 2 : 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(28, 26, 23, 0.03)",
    ...(work.image
      ? { border: `1px solid ${MUTED}66`, boxShadow: "0 26px 50px -28px rgba(28, 26, 23, 0.45)" }
      : { border: `1px dashed ${MUTED}` }),
  };

  // Same illustration-first, text-second choreography as ChapterSection —
  // thumbnail settles first, text follows ~140ms later, instead of both
  // arriving in the same frame off one shared wrapper.
  const revealViewport = { once: true, margin: "-10% 0px" } as const;

  return (
    <div
      data-work-row
      style={{
        display: "grid",
        gridTemplateColumns: reverse ? "minmax(0, 5fr) minmax(0, 7fr)" : "minmax(0, 7fr) minmax(0, 5fr)",
        gap: "clamp(28px, 4vw, 64px)",
        // "start" instead of "center": with center, cards whose tag list
        // wraps to a second line (more tags = taller text column) shifted
        // that card's thumbnail up/down relative to the others, so the
        // thumbnail-to-text relationship looked different per card even
        // though the layout code was identical. Top-aligning both columns
        // makes it consistent regardless of how much text/tags a card has.
        alignItems: "start",
      }}
    >
      {work.image ? (
        <motion.button
          type="button"
          data-work-thumb
          className="showcase-focus"
          onClick={(e) => onOpen(work, e.currentTarget)}
          aria-haspopup="dialog"
          aria-label={`View case study details for ${work.title}`}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={revealViewport}
          transition={{ duration: INK_DURATION, ease: INK_EASE }}
          style={{ ...thumbStyle, padding: 0, cursor: "pointer", font: "inherit", color: "inherit" }}
        >
          <img
            src={work.image.src}
            alt={work.image.alt}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
          />
          <div
            data-work-thumb-overlay
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              background: "rgba(28, 26, 23, 0.55)",
            }}
          >
            <Maximize2 aria-hidden size={22} strokeWidth={1.5} color={PAPER} />
            <span style={{ fontSize: 11, letterSpacing: "0.2em", color: PAPER, textTransform: "uppercase" }}>
              View case study
            </span>
          </div>
        </motion.button>
      ) : (
        // No screenshot yet, but the case study itself (tags, write-up,
        // metadata) is still real content worth reaching — same clickable
        // button as the image variant above, just with the dashed
        // "PREVIEW PENDING" pattern in place of a thumbnail. Once an
        // `image` gets added to this work item, it swaps to the image
        // variant automatically with no other change needed.
        <motion.button
          type="button"
          data-work-thumb
          className="showcase-focus"
          onClick={(e) => onOpen(work, e.currentTarget)}
          aria-haspopup="dialog"
          aria-label={`View case study details for ${work.title}`}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={revealViewport}
          transition={{ duration: INK_DURATION, ease: INK_EASE }}
          style={{ ...thumbStyle, padding: 0, cursor: "pointer", font: "inherit", color: "inherit" }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0.5,
              backgroundImage: `repeating-linear-gradient(to right, ${MUTED}22 0, ${MUTED}22 1px, transparent 1px, transparent 28px), repeating-linear-gradient(to bottom, ${MUTED}22 0, ${MUTED}22 1px, transparent 1px, transparent 28px)`,
            }}
          />
          <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <ImagePlus aria-hidden size={18} strokeWidth={1.5} color={MUTED} />
            <span style={{ fontSize: 11, letterSpacing: "0.15em", color: MUTED, textAlign: "center", padding: "0 16px" }}>
              PREVIEW PENDING
            </span>
          </div>
          <div
            data-work-thumb-overlay
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              background: "rgba(28, 26, 23, 0.55)",
            }}
          >
            <Maximize2 aria-hidden size={22} strokeWidth={1.5} color={PAPER} />
            <span style={{ fontSize: 11, letterSpacing: "0.2em", color: PAPER, textTransform: "uppercase" }}>
              View case study
            </span>
          </div>
        </motion.button>
      )}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={revealViewport}
        transition={{ duration: INK_DURATION, ease: INK_EASE, delay: INK_STAGGER }}
        style={{ display: "flex", flexDirection: "column", gap: 16, order: reverse ? 1 : 0 }}
      >
        <h3 style={{ margin: 0, fontSize: "clamp(28px, 3vw, 40px)", fontWeight: 800 }}>{work.title}</h3>
        <p style={{ margin: 0, fontSize: 18, lineHeight: 1.85, color: "#443f36" }}>{work.description}</p>
        {work.tags && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {work.tags.map((tag) => (
              <span key={tag} style={tagPillStyle("solid")}>
                {tag}
              </span>
            ))}
          </div>
        )}
        {work.link && (
          <a
            href={work.link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="ink-link showcase-focus"
            style={{
              fontSize: 13,
              letterSpacing: "0.2em",
              marginTop: 6,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              textDecoration: "none",
              alignSelf: "flex-start",
              color: INK,
            }}
          >
            <span>{work.link.label}</span>
            <span>→</span>
          </a>
        )}
      </motion.div>
    </div>
  );
}

/**
 * Compact "Role · Timeline · Status" line for the modal. Role is taken up to
 * its first colon (the full sentence lives in the write-up below; repeating
 * it here would just duplicate that block) — Timeline is only ever rendered
 * when the work item actually supplies one, never inferred. Status reads
 * "Live" when the project links out to a working site, "Case study"
 * otherwise, since that's the one signal already in the data that's
 * actually true rather than guessed.
 */
function MetadataStrip({ work }: { work: WorkItem }) {
  const roleShort = work.role?.split(":")[0].trim();
  // Defaults to link-presence ("Live" = has somewhere public to send a
  // visitor), but that conflates "public URL" with "actually live" — an
  // internal automation can be live and running for the client with
  // nothing public to link to. `work.status` overrides the default for
  // exactly that case, without inventing a fake link just to trigger it.
  const status = work.status ?? (work.link ? "Live" : "Case study");
  const items = [roleShort, work.timeline, status].filter((item): item is string => Boolean(item));
  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 12.5, letterSpacing: "0.05em", color: MUTED }}>
      {items.map((item, i) => (
        <span key={item} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {i > 0 && <span aria-hidden style={{ opacity: 0.6 }}>·</span>}
          {item}
        </span>
      ))}
    </div>
  );
}

function galleryNavButtonStyle(side: "left" | "right"): React.CSSProperties {
  return {
    position: "absolute",
    top: "50%",
    [side]: 12,
    transform: "translateY(-50%)",
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid ${INK}`,
    background: "rgba(243, 239, 230, 0.88)",
    color: INK,
    cursor: "pointer",
    padding: 0,
  };
}

/**
 * Left/right carousel over `images`, with dot indicators showing position.
 * Arrows and dots only render past a single image — a lone screenshot (most
 * projects today) just renders as a plain, static image with no dead
 * controls, and the same component keeps working unchanged once more
 * screenshots get added per project. Clicking the current image hands its
 * index up to `onExpand` for the fullscreen lightbox.
 */
function ProjectGallery({ images, onExpand }: { images: ProjectImage[]; onExpand: (index: number) => void }) {
  const [index, setIndex] = useState(0);
  const reduceMotion = useReducedMotion();
  if (images.length === 0) return null;
  const multi = images.length > 1;
  const go = (delta: number) => setIndex((i) => (i + delta + images.length) % images.length);
  const current = images[index];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ position: "relative", overflow: "hidden", border: `1px solid ${MUTED}66`, boxShadow: "0 26px 50px -28px rgba(28, 26, 23, 0.45)" }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.button
            key={current.src}
            type="button"
            onClick={() => onExpand(index)}
            aria-label={`Expand image ${index + 1} of ${images.length}: ${current.alt}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.08 : 0.3, ease: INK_EASE }}
            style={{ display: "block", width: "100%", padding: 0, margin: 0, border: "none", background: "transparent", cursor: "zoom-in" }}
          >
            <img src={current.src} alt={current.alt} style={{ display: "block", width: "100%", height: "auto" }} />
          </motion.button>
        </AnimatePresence>
        {multi && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous image" className="showcase-focus" style={galleryNavButtonStyle("left")}>
              <ChevronLeft aria-hidden size={18} strokeWidth={1.5} />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Next image" className="showcase-focus" style={galleryNavButtonStyle("right")}>
              <ChevronRight aria-hidden size={18} strokeWidth={1.5} />
            </button>
          </>
        )}
      </div>
      {multi && (
        <div role="tablist" aria-label="Gallery position" style={{ display: "flex", justifyContent: "center", gap: 10 }}>
          {images.map((img, i) => (
            <button
              key={img.src + i}
              type="button"
              role="tab"
              aria-selected={i === index}
              onClick={() => setIndex(i)}
              aria-label={`Go to image ${i + 1} of ${images.length}`}
              className="showcase-focus"
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                padding: 0,
                border: "none",
                cursor: "pointer",
                background: i === index ? ACCENT : `${MUTED}55`,
                transition: "background 0.28s ease",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A single annotation dot over the SitePreview's home-tab screenshot.
 * Hover-preview and click-pin are deliberately two independent states
 * (`hovering` here, `pinned` from the parent) rather than one shared
 * open/closed flag toggled by both: a real mouse click fires a hover-enter
 * on its way to the element, so a single toggle read at click time would
 * immediately re-close whatever the hover had just opened. Keeping them
 * separate — shown if either is true, click only ever flips `pinned` —
 * means hovering-then-clicking (the ordinary mouse path) can't cancel
 * itself out, and keyboard/touch users still get a click-to-toggle that
 * survives the pointer leaving. Flips which corner it opens from based on
 * which quadrant of the frame it sits in, so a marker near an edge never
 * renders its note off the visible preview.
 */
function SiteHotspotMarker({
  hotspot,
  index,
  pinned,
  onTogglePinned,
}: {
  hotspot: SiteHotspot;
  index: number;
  pinned: boolean;
  onTogglePinned: () => void;
}) {
  const [hovering, setHovering] = useState(false);
  const isOpen = pinned || hovering;
  const openLeft = hotspot.xPct > 60;
  const openUp = hotspot.yPct > 60;

  return (
    <div
      style={{ position: "absolute", left: `${hotspot.xPct}%`, top: `${hotspot.yPct}%`, transform: "translate(-50%, -50%)", zIndex: 2 }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onTogglePinned();
        }}
        onFocus={() => setHovering(true)}
        onBlur={() => setHovering(false)}
        aria-expanded={isOpen}
        aria-label={`${hotspot.label} — ${hotspot.note}`}
        className="showcase-focus"
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          border: `2px solid ${PAPER}`,
          background: ACCENT,
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.4)",
          cursor: "pointer",
          padding: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 700,
          color: PAPER,
          lineHeight: 1,
        }}
      >
        {index + 1}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, y: openUp ? 6 : -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: openUp ? 6 : -6 }}
            transition={{ duration: 0.22, ease: INK_EASE }}
            style={{
              position: "absolute",
              [openUp ? "bottom" : "top"]: "calc(100% + 10px)",
              [openLeft ? "right" : "left"]: 0,
              width: "min(230px, 60vw)",
              background: INK,
              color: PAPER,
              padding: "10px 14px",
              fontSize: 12.5,
              lineHeight: 1.55,
              boxShadow: "0 16px 32px -12px rgba(0, 0, 0, 0.5)",
              pointerEvents: "none",
            }}
          >
            <div style={{ fontWeight: 700, letterSpacing: "0.08em", fontSize: 10.5, textTransform: "uppercase", color: "#d98a96", marginBottom: 4 }}>
              {hotspot.label}
            </div>
            {hotspot.note}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Tabbed, hotspot-annotated stand-in for a true live embed — see
 * `SitePreview`'s own comment on `WorkItem` for why this exists instead of
 * an iframe. Tabs swap between real screenshots of actual site pages with
 * the same crossfade as `ProjectGallery`; clicking the current screenshot
 * opens the same fullscreen lightbox via `onExpand(tabIndex)`, since the
 * modal's `gallery` array (and its lightbox indexing) is built directly
 * from `preview.pages` — see ProjectModal.
 */
function SitePreview({ preview, onExpand }: { preview: SitePreview; onExpand: (index: number) => void }) {
  const [tabIndex, setTabIndex] = useState(0);
  const [pinnedHotspot, setPinnedHotspot] = useState<number | null>(null);
  const reduceMotion = useReducedMotion();
  const current = preview.pages[tabIndex];
  const hotspots = tabIndex === 0 ? preview.hotspots : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {preview.pages.map((page, i) => {
          const active = i === tabIndex;
          return (
            <button
              key={page.url}
              type="button"
              onClick={() => {
                setTabIndex(i);
                setPinnedHotspot(null);
              }}
              aria-current={active}
              className="showcase-focus"
              style={{
                ...tagPillStyle(active ? "solid" : "dashed"),
                cursor: "pointer",
                background: active ? INK : "transparent",
                color: active ? PAPER : INK,
              }}
            >
              {page.label}
            </button>
          );
        })}
      </div>

      <div style={{ position: "relative", overflow: "hidden", border: `1px solid ${MUTED}66`, boxShadow: "0 26px 50px -28px rgba(28, 26, 23, 0.45)" }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.button
            key={current.image.src}
            type="button"
            onClick={() => onExpand(tabIndex)}
            aria-label={`Expand screenshot of the ${current.label} page: ${current.image.alt}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.08 : 0.3, ease: INK_EASE }}
            style={{ display: "block", width: "100%", padding: 0, margin: 0, border: "none", background: "transparent", cursor: "zoom-in" }}
          >
            <img src={current.image.src} alt={current.image.alt} style={{ display: "block", width: "100%", height: "auto" }} />
          </motion.button>
        </AnimatePresence>
        {hotspots?.map((hotspot, i) => (
          <SiteHotspotMarker
            key={hotspot.label}
            hotspot={hotspot}
            index={i}
            pinned={pinnedHotspot === i}
            onTogglePinned={() => setPinnedHotspot((curr) => (curr === i ? null : i))}
          />
        ))}
      </div>

      <div style={{ fontSize: 11.5, letterSpacing: "0.03em", fontStyle: "italic", color: MUTED }}>
        Simulated preview — real screenshots of the live site (it blocks iframe embedding), not a live embed.
      </div>
    </div>
  );
}

/**
 * Fullscreen lightbox for a single gallery image, portaled to <body> at a
 * higher z-index than ProjectModal so it always stacks above it regardless
 * of DOM order. Rendered as a React child of the modal panel (not a
 * sibling) so its own backdrop click still bubbles through the panel's
 * existing stopPropagation and never accidentally closes the case-study
 * modal underneath — see the panel's onClick in ProjectModal.
 */
function ImageLightbox({ image, onClose }: { image: ProjectImage; onClose: () => void }) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <motion.div
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0.08 : INK_DURATION, ease: INK_EASE }}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        background: "rgba(12, 11, 10, 0.92)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "5vh 5vw",
      }}
    >
      <motion.img
        src={image.src}
        alt={image.alt}
        initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.97 }}
        transition={{ duration: reduceMotion ? 0.08 : 0.38, ease: INK_EASE }}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", boxShadow: "0 60px 120px -40px rgba(0, 0, 0, 0.6)" }}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close image"
        className="showcase-focus"
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          width: 36,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: `1px solid ${PAPER}`,
          background: "rgba(28, 26, 23, 0.6)",
          cursor: "pointer",
          color: PAPER,
        }}
      >
        <X aria-hidden size={16} strokeWidth={1.5} />
      </button>
    </motion.div>,
    document.body
  );
}

/**
 * Click-to-expand case study, portaled to <body> so it's never clipped or
 * mis-stacked by an ancestor's transform (several parent sections are
 * `motion.div`s that pick up an inline `transform` once animated, which
 * would otherwise break `position: fixed` containment). Entrance reuses the
 * same ease curve as the ink-wash page transition — see INK_EASE above —
 * so it reads as the same motion language, just a softer scale+fade instead
 * of a full-viewport wipe (a screen-covering wipe reads right for page
 * navigation, not for a detail panel that should feel like it's opening
 * *in place*). Content inside settles in three beats (title, then
 * screenshot, then write-up) rather than popping in as one block with the
 * panel — see contentReveal below.
 */
function ProjectModal({ work, onClose }: { work: WorkItem; onClose: () => void }) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  // The backdrop is the actual scroll container (the panel itself doesn't
  // scroll independently) — passed as `viewport.root` to the write-up's
  // whileInView below so its scroll-reveal is scoped to scrolling *within
  // the modal*, not the browser viewport behind it.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // preventScroll: the panel can be taller than the viewport, and the
    // browser's default focus-triggered scrollIntoView fights the layout's
    // own top-alignment (it was pulling the panel up ~100px, clipping the
    // close button off the top edge).
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        // Escape closes whichever layer is on top first — the lightbox has
        // its own listener too, but both fire on the same keypress, so this
        // guard stops the modal underneath from also closing in one press.
        setLightboxIndex((current) => {
          if (current !== null) return null;
          onClose();
          return current;
        });
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // `gallery` distinguishes "not specified yet" (fall back to the card's
  // `image`) from an explicit `[]` (e.g. Burnout Force Check, where the
  // live embed above already covers that ground and a static screenshot
  // under it would be redundant) — a length check on its own can't tell
  // those two cases apart, so this checks for the field's presence instead.
  // When `sitePreview` is set, its pages ARE the gallery — this is what
  // the lightbox indexes into when a SitePreview screenshot is clicked, so
  // `onExpand(tabIndex)` there lines up with the right image here.
  const gallery = work.sitePreview
    ? work.sitePreview.pages.map((p) => p.image)
    : (work.gallery ?? (work.image ? [work.image] : []));

  // Content settles in three quick beats rather than popping in as one
  // block with the panel — title first (the label), then the screenshot
  // (the painting), then the write-up (the inscription after it).
  const contentReveal = (step: number) => ({
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduceMotion ? 0.08 : 0.32, ease: INK_EASE, delay: reduceMotion ? 0 : INK_STAGGER * step },
  });

  return createPortal(
    <motion.div
      ref={scrollContainerRef}
      role="presentation"
      data-modal-backdrop
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0.08 : 0.3, ease: INK_EASE }}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        background: "radial-gradient(circle at 50% 35%, rgba(40, 36, 32, 0.7) 0%, rgba(12, 11, 10, 0.88) 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        overflowY: "auto",
        padding: "6vh 6vw",
      }}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        data-modal-panel
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.96, y: reduceMotion ? 0 : 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.97, y: reduceMotion ? 0 : 10 }}
        transition={{ duration: reduceMotion ? 0.08 : 0.38, ease: INK_EASE }}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          background: PAPER,
          color: INK,
          maxWidth: 880,
          width: "100%",
          flexShrink: 0,
          padding: "clamp(28px, 4vw, 56px)",
          boxShadow: "0 60px 120px -40px rgba(0, 0, 0, 0.6)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close project details"
          className="showcase-focus"
          style={{
            position: "absolute",
            top: 20,
            right: 20,
            width: 36,
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `1px solid ${INK}`,
            background: PAPER,
            cursor: "pointer",
            color: INK,
          }}
        >
          <X aria-hidden size={16} strokeWidth={1.5} />
        </button>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <motion.div {...contentReveal(1)} style={{ display: "flex", flexDirection: "column", gap: 12, paddingRight: 48 }}>
            <h3 id={titleId} style={{ margin: 0, fontSize: "clamp(28px, 3.4vw, 42px)", fontWeight: 800 }}>
              {work.title}
            </h3>
            <MetadataStrip work={work} />
            {work.tags && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {work.tags.map((tag) => (
                  <span key={tag} style={tagPillStyle("solid")}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </motion.div>

          {work.liveEmbed && (
            <motion.div {...contentReveal(2)} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11, letterSpacing: "0.2em", color: ACCENT, textTransform: "uppercase" }}>
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT }} />
                Live — try it
              </div>
              <iframe
                src={work.liveEmbed.src}
                title={work.liveEmbed.title}
                loading="lazy"
                sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                style={{
                  display: "block",
                  width: "100%",
                  height: "clamp(480px, 70vh, 720px)",
                  border: `1px solid ${MUTED}66`,
                  boxShadow: "0 26px 50px -28px rgba(28, 26, 23, 0.45)",
                }}
              />
            </motion.div>
          )}

          {work.sitePreview ? (
            <motion.div {...contentReveal(2)}>
              <SitePreview preview={work.sitePreview} onExpand={setLightboxIndex} />
            </motion.div>
          ) : (
            gallery.length > 0 && (
              <motion.div {...contentReveal(work.liveEmbed ? 2.4 : 2)}>
                <ProjectGallery images={gallery} onExpand={setLightboxIndex} />
              </motion.div>
            )
          )}

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ root: scrollContainerRef, once: true, margin: "-10% 0px" }}
            transition={{ duration: reduceMotion ? 0.08 : 0.32, ease: INK_EASE }}
            style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: "64ch" }}
          >
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.85, color: "#443f36" }}>
              {work.expandedDescription ?? work.description}
            </p>
            {work.outcome && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ root: scrollContainerRef, once: true, margin: "-10% 0px" }}
                transition={{ duration: reduceMotion ? 0.08 : 0.32, ease: INK_EASE, delay: reduceMotion ? 0 : INK_STAGGER }}
                style={{ display: "flex", gap: 12, fontSize: 14, lineHeight: 1.7 }}
              >
                <span style={{ fontWeight: 700, letterSpacing: "0.1em", color: ACCENT, flexShrink: 0 }}>OUTCOME</span>
                <span style={{ color: "#443f36" }}>{work.outcome}</span>
              </motion.div>
            )}
          </motion.div>

          {work.link && (
            <motion.a
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ root: scrollContainerRef, once: true, margin: "-10% 0px" }}
              transition={{ duration: reduceMotion ? 0.08 : 0.32, ease: INK_EASE, delay: reduceMotion ? 0 : INK_STAGGER * 2 }}
              href={work.link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="ink-link showcase-focus"
              style={{
                fontSize: 13,
                letterSpacing: "0.2em",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                textDecoration: "none",
                alignSelf: "flex-start",
                color: INK,
              }}
            >
              <span>{work.link.label}</span>
              <span>→</span>
            </motion.a>
          )}
        </div>

        <AnimatePresence>
          {lightboxIndex !== null && gallery[lightboxIndex] && (
            <ImageLightbox image={gallery[lightboxIndex]} onClose={() => setLightboxIndex(null)} />
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>,
    document.body
  );
}

export function ShowcaseClient() {
  const [loaded, setLoaded] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Always async (even at 0ms) — reduceMotion is null during SSR and on
    // the first client render, so setLoaded must never fire synchronously
    // in that same pass or the loader's opacity would mismatch what the
    // server rendered, breaking hydration.
    const t = setTimeout(() => setLoaded(true), reduceMotion ? 0 : 1700);
    return () => clearTimeout(t);
  }, [reduceMotion]);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeMobileNav();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileNavOpen, closeMobileNav]);

  const [expandedWork, setExpandedWork] = useState<WorkItem | null>(null);
  const workTriggerRef = useRef<HTMLElement | null>(null);

  const openWork = useCallback((work: WorkItem, trigger: HTMLElement) => {
    workTriggerRef.current = trigger;
    setExpandedWork(work);
  }, []);

  const closeWork = useCallback(() => {
    setExpandedWork(null);
    // Defer a frame so focus restoration doesn't fight the modal's own
    // unmount/blur in the same tick.
    requestAnimationFrame(() => workTriggerRef.current?.focus());
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      {/* DialKit's own productionEnabled default is broken — it reads
          process?.env?.NODE_ENV with optional chaining, which defeats
          Next.js's standard static replacement of that expression, so it
          fails to auto-hide in production. Guarding explicitly here instead
          of trusting the library default. */}
      {process.env.NODE_ENV !== "production" && <DialRoot position="top-right" />}
      <div style={{ fontFamily: "var(--font-shippori), serif" }}>
        <style>{`
          @media (max-width: 820px) {
            [data-work-row] { grid-template-columns: minmax(0, 1fr) !important; }
            /* "> *", not "> div" — the thumbnail slot is a button element
               (both the image and "PREVIEW PENDING" placeholder variants, so
               a visitor can open the case study either way), which a div-only
               selector silently skips. On reverse rows that left the
               button's own inline order:2 unset while the text column's
               order:1 got reset to 0, so the thumbnail rendered AFTER the
               text on mobile instead of before it — image-first is the
               intended reading order regardless of the desktop left/right
               alternation. */
            [data-work-row] > * { order: 0 !important; }
            [data-about-grid] { grid-template-columns: minmax(0, 1fr) !important; }
            [data-about-grid] > * { order: 0 !important; }
            /* Nav: five links no longer fit a row without shrinking touch
               targets below accessible tap-size minimums — swap for the
               hamburger toggle + full-screen menu instead. */
            [data-nav-links] { display: none !important; }
            [data-nav-toggle] { display: flex !important; }
            /* About illustration is position:absolute, so it never joins
               data-about-grid's own mobile single-column stacking above —
               its clamp() floor (400px) is wider than a phone viewport and
               it was overlapping the heading/portrait placeholder by
               ~230px. Shrink and tuck it into the top-right corner instead,
               clear of the grid content starting at left. transform:none
               cancels the desktop vertical-centering translateY, which
               doesn't apply here since this uses a fixed top offset instead. */
            [data-about-illustration] {
              left: auto !important;
              right: 2vw !important;
              top: -3vh !important;
              width: clamp(140px, 40vw, 220px) !important;
              transform: none !important;
            }
            /* Samurai/text overlap in the pinned Journey section: samurai is
               sized by height:80vh with no mobile cap, so on a narrow/tall
               phone viewport its scaled width covers most of the screen and
               sits directly on top of the text column instead of beside it.
               Stack them instead — text pinned to the top, samurai capped to
               a bottom band short enough that the two never share vertical
               space. */
            [data-journey-text] {
              width: min(460px, 82vw) !important;
              top: 8vh !important;
              transform: none !important;
              gap: 28px !important;
            }
            [data-journey-samurai] {
              height: 34vh !important;
              right: 4vw !important;
            }
            /* Contact's wax-seal envelope has the same unbounded-floor
               problem as the About illustration and samurai above — its
               320px width floor was wider than a phone viewport, dropping
               its bottom edge 50px+ into the "Get in touch" heading. */
            [data-contact-seal] {
              width: clamp(120px, 34vw, 480px) !important;
              top: 0 !important;
            }
            /* Hero: same single-column collapse as the about/work grids —
               text stacks above illustration instead of sitting beside it.
               Section switches from a fixed 100vh to auto/min-height since a
               full text block AND a full illustration no longer fit one
               screen stacked; illustration gets a fixed crop height instead
               of filling the (now auto) row, and the scroll hint is dropped
               since it has nowhere stable to anchor once the text panel's
               height is content-driven instead of viewport-driven. */
            [data-hero-section] { height: auto !important; min-height: 100vh !important; }
            [data-hero-grid] { grid-template-columns: minmax(0, 1fr) !important; height: auto !important; }
            [data-hero-text] { padding: 120px 8vw 56px !important; }
            [data-hero-illustration] { height: 52vh !important; }
            [data-hero-scroll] { display: none !important; }
            [data-hero-seam-fade] {
              left: 0 !important;
              right: 0 !important;
              top: 0 !important;
              bottom: auto !important;
              width: auto !important;
              height: min(140px, 16vh) !important;
              background: linear-gradient(to bottom, ${PAPER}, rgba(243, 239, 230, 0)) !important;
            }
            /* The project modal's chrome (backdrop padding + panel padding)
               was sized for desktop, where 6vw/28px floor is a small
               fraction of the viewport — on a ~390px phone it eats over a
               quarter of the width before any content starts, which matters
               most for the live iframe embed (Burnout Force Check) and the
               SitePreview screenshots, both of which want every pixel of
               width they can get. */
            [data-modal-backdrop] { padding: 3vh 3vw !important; }
            [data-modal-panel] { padding: 20px 16px !important; }
          }
          .showcase-focus { border-radius: 2px; }
          .showcase-focus:focus-visible {
            outline: 2px solid ${ACCENT};
            outline-offset: 3px;
          }
          /* Underline draws on left-to-right like a brush stroke landing,
             rather than a flat color swap or an underline that just appears.
             The "right: 100% -> 0" trick keeps it anchored to the left edge
             as it grows, instead of scaling from the center like a generic
             CSS underline transition would. */
          .ink-link { position: relative; }
          .ink-link::after {
            content: "";
            position: absolute;
            left: 0;
            right: 100%;
            bottom: -4px;
            height: 1px;
            background: currentColor;
            transition: right 0.36s cubic-bezier(0.16, 1, 0.32, 1);
          }
          .ink-link:hover::after,
          .ink-link:focus-visible::after {
            right: 0;
          }
          [data-work-thumb-overlay] { opacity: 0; transition: opacity 0.28s cubic-bezier(0.16, 1, 0.32, 1); }
          [data-work-thumb]:hover [data-work-thumb-overlay],
          [data-work-thumb]:focus-visible [data-work-thumb-overlay] {
            opacity: 1;
          }
          /* Contact's real CTA — filled instead of underlined since it's
             the one place on the site asking for a click rather than a
             scroll/read, so it should read as a button, not another
             ink-link in a paragraph. Hover swaps fill/text rather than
             drawing an underline, same ink-wash timing as everything else. */
          .contact-cta {
            display: inline-flex;
            align-items: center;
            gap: 12px;
            padding: 18px 36px;
            background: ${ACCENT};
            color: ${PAPER};
            border: 1px solid ${ACCENT};
            font-size: clamp(15px, 1.5vw, 17px);
            letter-spacing: 0.04em;
            text-decoration: none;
            transition: background 0.32s cubic-bezier(0.16, 1, 0.32, 1), color 0.32s cubic-bezier(0.16, 1, 0.32, 1);
          }
          .contact-cta:hover,
          .contact-cta:focus-visible {
            background: ${PAPER};
            color: ${ACCENT};
          }
        `}</style>

        {/* Loader */}
        <div
          role="presentation"
          onClick={() => setLoaded(true)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: PAPER,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 30,
            transition: "opacity 0.9s cubic-bezier(0.16, 1, 0.32, 1)",
            cursor: "pointer",
            opacity: loaded ? 0 : 1,
            pointerEvents: loaded ? "none" : "auto",
          }}
        >
          <div
            style={{
              width: 108,
              height: 108,
              border: `3px solid ${ACCENT}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 60,
              fontWeight: 800,
              color: ACCENT,
            }}
          >
            桜
          </div>
          <div style={{ fontSize: 12, letterSpacing: "0.4em", color: INK }}>読み込み中: LOADING</div>
        </div>

        {/* Nav */}
        <nav
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 6vw 34px",
            background: `linear-gradient(to bottom, rgba(243,239,230,0.98) 70%, rgba(243,239,230,0))`,
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            transition: "opacity 0.8s cubic-bezier(0.16, 1, 0.32, 1) 0.9s",
            opacity: loaded ? 1 : 0,
          }}
        >
          {/* Quiet, secondary — not the logo mark itself, since that already
              does its own job (scroll to top) and repurposing it to leave
              the site would surprise anyone expecting standard logo
              behavior. Plain TransitionLink to "/" reuses the sitewide
              ink-wash cover/reveal, a quick cross-fade rather than the
              bloom, which is intentionally a one-way, first-arrival-only
              moment that only lives on the gateway's own forward CTA. */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <TransitionLink
              href="/"
              aria-label="Back to gateway"
              className="ink-link showcase-focus"
              style={{ fontSize: 15, color: MUTED, textDecoration: "none" }}
            >
              ←
            </TransitionLink>
            <TransitionLink href="#top" className="ink-link showcase-focus" style={{ fontSize: 18, fontWeight: 800, letterSpacing: "0.1em", textDecoration: "none", color: ACCENT }}>
              桜
            </TransitionLink>
          </div>
          <div data-nav-links style={{ display: "flex", gap: 32 }}>
            <TransitionLink href="#about" className="ink-link showcase-focus" style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.3em", textDecoration: "none", color: INK }}>
              ABOUT
            </TransitionLink>
            <TransitionLink href="#skills" className="ink-link showcase-focus" style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.3em", textDecoration: "none", color: INK }}>
              SKILLS
            </TransitionLink>
            <TransitionLink href="#works" className="ink-link showcase-focus" style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.3em", textDecoration: "none", color: INK }}>
              WORKS
            </TransitionLink>
            <TransitionLink href="#journey" className="ink-link showcase-focus" style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.3em", textDecoration: "none", color: INK }}>
              JOURNEY
            </TransitionLink>
            <TransitionLink href="#contact" className="ink-link showcase-focus" style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.3em", textDecoration: "none", color: INK }}>
              CONTACT
            </TransitionLink>
          </div>
          {/* Hidden on desktop, shown below 820px in place of data-nav-links
              — five links no longer fit a single row at phone widths without
              shrinking touch targets below accessible tap-size minimums. */}
          <button
            type="button"
            data-nav-toggle
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={mobileNavOpen}
            className="showcase-focus"
            style={{
              display: "none",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              padding: 0,
              border: "none",
              background: "transparent",
              color: INK,
              cursor: "pointer",
            }}
          >
            <Menu aria-hidden size={24} strokeWidth={1.5} />
          </button>
        </nav>

        <AnimatePresence>
          {mobileNavOpen && (
            <motion.div
              key="mobile-nav"
              role="dialog"
              aria-modal="true"
              aria-label="Site navigation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0.08 : INK_DURATION, ease: INK_EASE }}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 250,
                background: PAPER,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 6vw" }}>
                <span aria-hidden style={{ fontSize: 18, fontWeight: 800, letterSpacing: "0.1em", color: ACCENT }}>
                  桜
                </span>
                <button
                  type="button"
                  onClick={closeMobileNav}
                  aria-label="Close menu"
                  className="showcase-focus"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 44,
                    height: 44,
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    color: INK,
                    cursor: "pointer",
                  }}
                >
                  <X aria-hidden size={24} strokeWidth={1.5} />
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", gap: 4, padding: "0 8vw", marginTop: -44 }}>
                {[
                  { href: "#about", label: "ABOUT" },
                  { href: "#skills", label: "SKILLS" },
                  { href: "#works", label: "WORKS" },
                  { href: "#journey", label: "JOURNEY" },
                  { href: "#contact", label: "CONTACT" },
                ].map((link) => (
                  <TransitionLink
                    key={link.href}
                    href={link.href}
                    onClick={closeMobileNav}
                    className="showcase-focus"
                    style={{
                      fontSize: "clamp(26px, 8vw, 34px)",
                      fontWeight: 800,
                      letterSpacing: "0.06em",
                      textDecoration: "none",
                      color: INK,
                      padding: "14px 0",
                    }}
                  >
                    {link.label}
                  </TransitionLink>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hero — split into a dedicated text panel and illustration panel
            rather than overlapping text on the artwork behind a legibility
            scrim. That scrim was an inherent tradeoff (dim enough to read,
            and the illustration loses its own contrast); giving each its
            own zone removes the conflict entirely, matching how Origins and
            Learning curve already separate text/illustration into columns
            instead of layering them. */}
        <section
          id="top"
          data-hero-section
          style={{ position: "relative", height: "100vh", overflow: "hidden", background: PAPER, color: INK }}
        >
          <PetalCanvas density={0.5} />
          <div
            data-hero-grid
            style={{ position: "relative", height: "100%", display: "grid", gridTemplateColumns: "38% 62%" }}
          >
            {/* Text panel — plain paper background, no illustration behind it. */}
            <div data-hero-text style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 6vw" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 440 }}>
                {[
                  <div key="eyebrow" style={{ fontSize: 12, letterSpacing: "0.42em", color: MUTED }}>
                    PORTFOLIO: 二〇二六
                  </div>,
                  <h1 key="name" style={{ margin: 0, fontSize: "clamp(38px, 4.6vw, 64px)", fontWeight: 800, lineHeight: 1.08 }}>
                    {NAME}
                  </h1>,
                  <p key="tagline" style={{ margin: 0, fontSize: "clamp(16px, 1.5vw, 19px)", lineHeight: 1.6, color: "#443f36" }}>
                    Full-stack developer building real experience, one project, one client, one problem at a time.
                  </p>,
                  <div key="rule" style={{ width: 120, height: 3, background: ACCENT }} />,
                  <TransitionLink
                    key="cta"
                    href="#works"
                    className="ink-link showcase-focus"
                    style={{
                      fontSize: 14,
                      letterSpacing: "0.2em",
                      textDecoration: "none",
                      color: ACCENT,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      alignSelf: "flex-start",
                    }}
                  >
                    <span>VIEW WORK</span>
                    <span aria-hidden>→</span>
                  </TransitionLink>,
                  <div key="coherence" style={{ fontSize: 12.5, letterSpacing: "0.03em", fontStyle: "italic", color: MUTED }}>
                    Same discipline as the figure in the frame, just aimed at systems, not swordsmanship.
                  </div>,
                ].map((el, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 26 }}
                    animate={loaded ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: INK_DURATION, delay: 0.1 + i * INK_STAGGER, ease: INK_EASE }}
                  >
                    {el}
                  </motion.div>
                ))}
              </div>
              <div data-hero-scroll style={{ position: "absolute", left: "50%", bottom: 32, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 11, letterSpacing: "0.4em", color: MUTED }}>SCROLL</div>
                <div style={{ width: 1, height: 52, background: INK, opacity: 0.4 }} />
              </div>
            </div>

            {/* Illustration panel — full artwork at full opacity/contrast,
                no scrim needed since text no longer sits on top of it. */}
            <div data-hero-illustration style={{ position: "relative", overflow: "hidden" }}>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: `url("/showcase/hero-bg.png") center / cover no-repeat`,
                  transform: loaded ? "scale(1)" : "scale(1.07)",
                  transition: "transform 2.8s cubic-bezier(0.16, 1, 0.32, 1)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: "18vh",
                  background: `linear-gradient(to bottom, rgba(243,239,230,0), ${PAPER})`,
                }}
              />
              {/* Soft fade at the panel seam so the illustration emerges out
                  of the text panel's cream rather than meeting it at a hard
                  line — the two panels still don't overlap, this just
                  softens the join. Left-edge fade on desktop (panels sit
                  side by side); the mobile breakpoint below flips this to a
                  top-edge fade since the seam becomes horizontal once the
                  panels stack. */}
              <div
                data-hero-seam-fade
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: "min(220px, 18vw)",
                  background: `linear-gradient(to right, ${PAPER}, rgba(243, 239, 230, 0))`,
                  pointerEvents: "none",
                }}
              />
            </div>
          </div>
        </section>

        {/* About */}
        <section
          id="about"
          style={{ position: "relative", overflow: "hidden", background: INK, color: PAPER, padding: SECTION_PAD }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: "-8vh",
              right: "-4vw",
              fontSize: "clamp(280px, 34vw, 560px)",
              fontWeight: 800,
              color: "rgba(243, 239, 230, 0.045)",
              lineHeight: 1,
              userSelect: "none",
            }}
          >
            人
          </div>
          <img src="/showcase/about-deco-large-1.png" alt="" aria-hidden style={{ position: "absolute", left: "-10vw", top: "-6vh", width: "55vw", filter: "invert(1)", mixBlendMode: "screen", opacity: 0.1, pointerEvents: "none" }} />
          <img src="/showcase/about-deco-large-2.png" alt="" aria-hidden style={{ position: "absolute", right: "-8vw", bottom: "-10vh", width: "48vw", filter: "invert(1)", mixBlendMode: "screen", opacity: 0.08, pointerEvents: "none" }} />
          <img src="/showcase/about-deco-small-1.png" alt="" aria-hidden style={{ position: "absolute", right: "12vw", top: "16vh", width: 44, filter: "invert(1)", mixBlendMode: "screen", opacity: 0.18, transform: "rotate(40deg)", pointerEvents: "none" }} />
          <img src="/showcase/about-deco-small-2.png" alt="" aria-hidden style={{ position: "absolute", left: "8vw", bottom: "12vh", width: 34, filter: "invert(1)", mixBlendMode: "screen", opacity: 0.14, transform: "rotate(-70deg)", pointerEvents: "none" }} />
          <div data-about-grid style={{ position: "relative", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)", gap: "clamp(32px, 5vw, 80px)", alignItems: "start" }}>
            {/* about.png's own frame is mostly empty in its upper-left, which
                is why it can sit this close to the heading without fighting
                it. Positioned relative to the grid (not the section) and
                vertically centered against it — was pinned to a fixed offset
                from the section's own top instead, which put its center
                ~240px above the text block's actual center once the About
                copy grew past a single short paragraph. The ink figure was
                painted for a cream backdrop (like torii-gate/mountain-peak) —
                its dark strokes sit almost flush with this section's near-
                black background, so a soft warm glow behind just the figure
                (not the whole frame) restores the contrast it needs to read,
                without looking like a boxed-in illustration slot. */}
            <div
              data-about-illustration
              // Narrower than before (was clamp(400,38vw,580)) — centering
              // it against the now much-taller grid (5 paragraphs, was 1)
              // put the figure's widest point, the robe/base, directly over
              // paragraph text instead of the empty margin it had at the
              // old, shorter grid height. Narrowing restores clearance
              // instead of abandoning the centering fix.
              style={{ position: "absolute", left: "7vw", top: "50%", transform: "translateY(-50%)", width: "clamp(300px, 28vw, 420px)" }}
            >
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  left: "32%",
                  top: "22%",
                  width: "58%",
                  height: "66%",
                  background: "radial-gradient(ellipse at center, rgba(243,239,230,0.4), rgba(243,239,230,0.14) 55%, transparent 75%)",
                  filter: "blur(20px)",
                  pointerEvents: "none",
                }}
              />
              <img
                src="/showcase/about.png"
                alt=""
                aria-hidden
                // The backing glow only lifts contrast at the figure's
                // silhouette edge — its interior (ink strokes painted for a
                // cream backdrop) still read as near-black-on-near-black.
                // brightness+contrast lifts the strokes themselves so the
                // robe's folds and the figure's form are actually legible,
                // not just its outline.
                style={{ position: "relative", display: "block", width: "100%", pointerEvents: "none", filter: "brightness(1.55) contrast(0.92)" }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
              {/* Kanji stacked above the heading, not beside it — matches
                  ChapterSection's pattern (Skills/Origins/Learning curve),
                  which is also what keeps this heading's left edge aligned
                  with theirs instead of drifting right by the kanji's own
                  width+gap. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ fontSize: 15, letterSpacing: "0.4em", color: "#d98a96" }}>人</div>
                <h2 style={{ margin: 0, fontSize: "clamp(30px, 3.4vw, 46px)", fontWeight: 800, letterSpacing: "0.06em" }}>About</h2>
              </div>
              <div style={{ position: "relative", width: "min(220px, 60vw)", aspectRatio: "1" }}>
                <div style={{ position: "absolute", inset: 0, border: "1px solid #6b6355", transform: "translate(10px, 10px)" }} />
                <img
                  src="/showcase/portrait.png"
                  alt={`Portrait of ${NAME}`}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    border: "1px solid rgba(243, 239, 230, 0.3)",
                  }}
                />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                <p style={{ margin: 0, fontSize: "clamp(17px, 1.6vw, 20px)", lineHeight: 1.85, color: PAPER, maxWidth: "62ch" }}>
                  I&apos;m a web developer working across frontend and backend, still actively building on
                  what I learned at Higher Performance Group. Most days are spent learning something new,
                  then finding where it actually fits. Lately that&apos;s meant using AI tooling to move
                  faster without cutting corners on testing or care.
                </p>
                <p style={{ margin: 0, fontSize: "clamp(17px, 1.6vw, 20px)", lineHeight: 1.85, color: PAPER, maxWidth: "62ch" }}>
                  University and client work taught me the same lesson twice: the hard part usually
                  isn&apos;t writing the code, it&apos;s figuring out what&apos;s actually wrong. I&apos;ve
                  learned to sit with a problem, mine or a client&apos;s, until I understand it, not just
                  until it compiles.
                </p>
                <p style={{ margin: 0, fontSize: "clamp(17px, 1.6vw, 20px)", lineHeight: 1.85, color: PAPER, maxWidth: "62ch" }}>
                  AI-assisted development has changed how I work, not what I deliver. It gets me to a
                  working version faster, which means more time left for the part that matters: making
                  sure it&apos;s right.
                </p>
                <p style={{ margin: 0, fontSize: "clamp(17px, 1.6vw, 20px)", lineHeight: 1.85, color: PAPER, maxWidth: "62ch" }}>
                  Plan first, check twice. That&apos;s most of the job.
                </p>
                <p style={{ margin: 0, fontSize: "clamp(17px, 1.6vw, 20px)", lineHeight: 1.85, color: PAPER, maxWidth: "62ch" }}>
                  I&apos;ve been around computers for as long as I can remember. It&apos;s less a hobby than
                  a default setting.
                </p>
              </div>
              <div style={{ width: 90, height: 2, background: ACCENT }} />
            </div>
          </div>
        </section>

        <ChapterSection
          id="skills"
          kanji="技"
          title="Skills"
          body="Grounded in the work that follows, not a self-rated list."
          motif={
            // 300 -> 440: paintbrush.png is a square 1:1 asset, unlike its
            // portrait 928x1152 siblings (torii-gate/mountain-peak) at
            // 600-660 wide — at the old size it was both narrower AND far
            // shorter (300px tall vs. 744px+ for the portrait pieces), so it
            // filled a fraction of the motif column's height those other
            // chapters do, reading as a sparse section relative to them.
            <SectionIllustration
              src="/showcase/paintbrush.png"
              alt="Ink-wash illustration of a brush resting beside an ink stone with a dab of red pigment"
              maxWidth={440}
            />
          }
          tags={[
            "JavaScript",
            "CSS/HTML",
            "Node.js",
            "PHP",
            "Git",
            "Airtable",
            "ActiveCampaign",
            "AI Automation",
            "Email Marketing",
            "Lead Generation",
            "AI-Assisted Scraping",
          ]}
          secondaryTags={{ label: "Currently learning", items: ["React.js", "Next.js", "APIs"] }}
          callout="AI-assisted development"
        />

        {/* Works */}
        <section id="works" style={{ position: "relative", overflow: "hidden", background: PAPER, padding: SECTION_PAD, color: INK }}>
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: "-9vh",
              right: "-3vw",
              fontSize: "clamp(240px, 30vw, 480px)",
              fontWeight: 800,
              color: "rgba(28, 26, 23, 0.04)",
              lineHeight: 1,
              userSelect: "none",
            }}
          >
            作
          </div>
          <PetalCanvas density={0.3} />
          {/* Kanji stacked above the heading, not beside it — same fix as
              About, for the same reason: matches ChapterSection's pattern so
              this heading's left edge lines up with Skills/Origins/Learning
              curve instead of sitting ~40px further right. */}
          <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 16, borderBottom: `1px solid ${INK}`, paddingBottom: 20, marginBottom: 72 }}>
            <div style={{ fontSize: 15, letterSpacing: "0.4em", color: ACCENT }}>作</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
              <h2 style={{ margin: 0, fontSize: "clamp(30px, 3.4vw, 46px)", fontWeight: 800, letterSpacing: "0.06em" }}>
                Selected Works
              </h2>
              <div style={{ marginLeft: "auto", fontSize: 12, letterSpacing: "0.3em", color: MUTED }}>
                {`01-${String(works.length).padStart(2, "0")}`}
              </div>
            </div>
          </div>

          <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 96 }}>
            {works.map((work, i) => (
              <WorkRow key={work.title} work={work} reverse={i % 2 === 1} onOpen={openWork} />
            ))}
          </div>
        </section>

        <AnimatePresence>
          {expandedWork && <ProjectModal key={expandedWork.title} work={expandedWork} onClose={closeWork} />}
        </AnimatePresence>

        {/* PLACEHOLDER COPY — fabricated for layout/visual review, not
            biographical fact. Swap for the real story (school, first
            projects, actual dates) before this ever ships. Now closes the
            personal-story arc just before Contact rather than opening the
            page — "Origins" still reads fine here since it's about how the
            work started, not a claim about page position. */}
        <ChapterSection
          id="journey"
          kanji="起"
          title="Origins"
          body="Every developer has a moment where code stops being an assignment and starts being a language. That moment came in a public university computer science program, under a professor who graded correctness over cleverness and made it clear early that a program which merely runs is not the same as a program which can be trusted. The first real project, a group build, four people, one shared repository, and no idea yet what a merge conflict was, broke constantly. It taught more in three weeks than the semester before it had in three months. Hails from Bulacan State University. Now looking to take on more, helping clients build the sites and web apps they actually need."
          highlights={[
            "First line of code written out of genuine curiosity, not a syllabus requirement",
            "Learned version control the expensive way, by losing a teammate's work, once, and never again",
            "Left the program with a habit that stuck: read the error message before guessing at the fix",
          ]}
          motif={
            <SectionIllustration
              src="/showcase/torii-gate.png"
              alt="Ink-wash illustration of a torii gate beneath falling cherry blossom petals, with birds in flight"
              maxWidth={600}
            />
          }
        />

        {/* PLACEHOLDER COPY — same caveat as above. */}
        <ChapterSection
          kanji="道"
          title="Learning curve"
          body="Between coursework and a first real client sat a long stretch of small, unglamorous builds: the kind that don't make a portfolio but make a developer. PHP tools written for a handful of actual users instead of a grade. A scraper that quietly turned a week of manual copy-pasting into a five-minute script, and taught more about edge cases than any lecture could. Somewhere in that stretch, the standard shifted from code that runs to code that survives contact with someone who isn't the person who wrote it."
          highlights={[
            "Built and shipped several small PHP tools for real, if informal, users",
            "Automated a manual data-collection workflow that used to eat hours every week",
            "First taste of the unglamorous half of the job: documentation, edge cases, and other people's expectations",
          ]}
          motif={
            <SectionIllustration
              src="/showcase/mountain-peak.png"
              alt="Ink-wash illustration of a mountain peak with a dashed trail winding up through pines, birds circling above"
              maxWidth={660}
            />
          }
          reverse
        />

        <JourneySection />

        {/* Contact */}
        {/* Closing section since the reorder — border-top frames it as the
            page's final chapter (echoing Works' rule-under-heading and the
            footer's own border-top just below); padding intentionally stays
            160px (vs. the shared 140px SECTION_PAD) as the one deliberate
            exception in the vertical-rhythm normalization, since this
            section was already given extra weight on purpose. The kanji
            watermark, though, is back to the shared clamp/opacity baseline
            below — it doesn't need its own exception, just consistency. */}
        <section id="contact" style={{ position: "relative", overflow: "hidden", background: PAPER, padding: "160px 6vw", color: INK, textAlign: "center", borderTop: `1px solid ${INK}` }}>
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: "-12vh",
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: "clamp(240px, 30vw, 480px)",
              fontWeight: 800,
              color: "rgba(28, 26, 23, 0.04)",
              lineHeight: 1,
              userSelect: "none",
            }}
          >
            縁
          </div>
          <PetalCanvas density={0.4} />
          <img
            src="/showcase/wax.png"
            alt=""
            aria-hidden
            data-contact-seal
            style={{
              position: "absolute",
              right: "-3vw",
              top: "4vh",
              width: "clamp(320px, 32vw, 480px)",
              transform: "rotate(-6deg)",
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 26 }}>
            <div style={{ fontSize: 15, letterSpacing: "0.4em", color: ACCENT }}>縁</div>
            <h2 style={{ margin: 0, fontSize: "clamp(34px, 4vw, 56px)", fontWeight: 800, letterSpacing: "0.04em" }}>
              Get in touch
            </h2>
            <p style={{ margin: 0, fontSize: "clamp(17px, 1.6vw, 20px)", lineHeight: 1.7, color: "#443f36", maxWidth: "42ch" }}>
              Have something worth building? Let&apos;s talk.
            </p>
            <div style={{ fontSize: 12, letterSpacing: "0.25em", color: MUTED, textTransform: "uppercase" }}>
              Freelance. Part-time. Full-time.
            </div>
            <a href={`mailto:${CONTACT_EMAIL}`} className="contact-cta showcase-focus" style={{ marginTop: 10 }}>
              <Mail aria-hidden size={17} strokeWidth={1.5} />
              <span>{CONTACT_EMAIL}</span>
            </a>
            <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 28 }}>
              <a
                href="https://www.linkedin.com/in/franz-adriene-aclon-00a785304/"
                target="_blank"
                rel="noopener noreferrer"
                className="ink-link showcase-focus"
                style={{
                  fontSize: 13,
                  letterSpacing: "0.2em",
                  textDecoration: "none",
                  color: INK,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>LINKEDIN</span>
                <span aria-hidden>→</span>
              </a>
              <a
                href="https://github.com/andireyes06-maker"
                target="_blank"
                rel="noopener noreferrer"
                className="ink-link showcase-focus"
                style={{
                  fontSize: 13,
                  letterSpacing: "0.2em",
                  textDecoration: "none",
                  color: INK,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>GITHUB</span>
                <span aria-hidden>→</span>
              </a>
              {/* Single link, not separate View/Download buttons — opening the
                  PDF in a new tab already hands the visitor the browser's own
                  viewer, which has its own download control built in. */}
              <a
                href="/showcase/resume.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="ink-link showcase-focus"
                style={{
                  fontSize: 13,
                  letterSpacing: "0.2em",
                  textDecoration: "none",
                  color: INK,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>RESUME</span>
                <span aria-hidden>→</span>
              </a>
            </div>
          </div>
        </section>

        <footer style={{ position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "36px 6vw", borderTop: `1px solid ${INK}`, background: PAPER, fontSize: 13, letterSpacing: "0.02em", color: "#443f36" }}>
          <img
            src="/showcase/cherry.png"
            alt=""
            aria-hidden
            style={{ position: "absolute", left: "3vw", top: 6, width: 52, opacity: 0.7, transform: "rotate(8deg)", pointerEvents: "none" }}
          />
          <div style={{ position: "relative", paddingLeft: 44 }}>{NAME}: 二〇二六</div>
          <a href={`mailto:${CONTACT_EMAIL}`} className="ink-link showcase-focus" style={{ position: "relative", letterSpacing: "0.02em", color: "#443f36" }}>
            {CONTACT_EMAIL}
          </a>
        </footer>
      </div>
    </MotionConfig>
  );
}
