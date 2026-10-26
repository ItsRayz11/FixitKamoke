"use client";

import { useEffect } from "react";
import { track, type TrackName } from "@/lib/track";

/** Counts one funnel event when a page is shown (for example a product listing). Renders nothing. */
export function TrackView({ event }: { event: TrackName }) {
  useEffect(() => { track(event); }, [event]);
  return null;
}
