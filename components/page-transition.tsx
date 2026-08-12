"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

type TransitionAction = { kind: "scroll"; id: string } | { kind: "route"; href: string };

const TransitionContext = createContext<(action: TransitionAction) => void>(() => {});

/** Fires a same-page anchor scroll or a route push behind the ink-wash cover. */
export function useInkTransition() {
  return useContext(TransitionContext);
}

const EASE = [0.16, 1, 0.32, 1] as const;
const COVER_S = 0.18;
const REVEAL_S = 0.23;
const REDUCED_S = 0.1;
// If a route push somehow never resolves (nav error, etc.), don't leave the
// viewport permanently covered — force a reveal instead of hanging forever.
const ROUTE_FALLBACK_MS = 1500;

export function PageTransitionProvider({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const pathname = usePathname();

  const [covering, setCovering] = useState(false);
  const busyRef = useRef(false);
  const pendingActionRef = useRef<TransitionAction | null>(null);
  const pendingRoutePathRef = useRef<string | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = useCallback((action: TransitionAction) => {
    if (busyRef.current) return;
    busyRef.current = true;
    pendingActionRef.current = action;
    setCovering(true);
  }, []);

  // Once a route push actually lands (pathname matches the target), that's
  // the real "new page is mounted" signal — more reliable than a fixed
  // timeout, since App Router doesn't hand back a navigation-complete promise.
  useEffect(() => {
    if (pendingRoutePathRef.current && pathname === pendingRoutePathRef.current) {
      pendingRoutePathRef.current = null;
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      setCovering(false);
    }
  }, [pathname]);

  function handleCoverComplete() {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    if (!action) return;

    if (action.kind === "scroll") {
      document.getElementById(action.id)?.scrollIntoView({ behavior: "instant", block: "start" });
      setCovering(false);
      return;
    }

    pendingRoutePathRef.current = action.href;
    router.push(action.href);
    fallbackTimerRef.current = setTimeout(() => {
      pendingRoutePathRef.current = null;
      setCovering(false);
    }, ROUTE_FALLBACK_MS);
  }

  return (
    <TransitionContext.Provider value={trigger}>
      {children}
      <motion.div
        aria-hidden
        initial={false}
        animate={{
          opacity: covering ? 1 : 0,
          scale: reduceMotion ? 1 : covering ? 1 : 1.03,
        }}
        transition={{
          duration: reduceMotion ? REDUCED_S : covering ? COVER_S : REVEAL_S,
          ease: EASE,
        }}
        onAnimationComplete={() => {
          if (covering) {
            handleCoverComplete();
          } else {
            busyRef.current = false;
          }
        }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          pointerEvents: covering ? "auto" : "none",
          background:
            "radial-gradient(circle at 50% 50%, #f3efe6 0%, #f3efe6 62%, rgba(28,26,23,0.07) 100%)",
        }}
      />
    </TransitionContext.Provider>
  );
}
