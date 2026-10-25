"use client";

import { useEffect } from "react";
import { track } from "@/lib/track";

const KEY = "fixit.recent.v1";

/** Counts a product view and remembers it (in this browser only) for the "recently viewed" strip. */
export function ProductView({ productId }: { productId: string }) {
  useEffect(() => {
    track("product_view");
    try {
      const cur: string[] = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      const next = [productId, ...cur.filter((x) => x !== productId)].slice(0, 12);
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch { /* storage unavailable */ }
  }, [productId]);
  return null;
}
