"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { track, type TrackName } from "@/lib/track";

/** A normal link that also counts one funnel event when it is followed (for example listing to product detail). */
export function TrackedLink({ event, onClick, ...rest }: ComponentProps<typeof Link> & { event: TrackName }) {
  return <Link {...rest} onClick={(e) => { track(event); onClick?.(e); }} />;
}
