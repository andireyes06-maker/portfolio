"use client";

import { type AnchorHTMLAttributes, type MouseEvent } from "react";
import { useInkTransition } from "./page-transition";

interface TransitionLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
}

/**
 * Drop-in replacement for `<a>` (same-page `#anchor` or internal route) that
 * plays the shared ink-wash cover/reveal instead of an instant cut. Modifier
 * clicks (cmd/ctrl/shift/middle-click) are left alone so "open in new tab"
 * still works normally.
 */
export function TransitionLink({ href, onClick, ...rest }: TransitionLinkProps) {
  const trigger = useInkTransition();

  return (
    <a
      href={href}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        event.preventDefault();
        trigger(href.startsWith("#") ? { kind: "scroll", id: href.slice(1) } : { kind: "route", href });
      }}
      {...rest}
    />
  );
}
