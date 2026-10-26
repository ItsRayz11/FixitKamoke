"use client";

import { useEffect } from "react";

/**
 * Below 640px the CSS in globals.css turns each row of an admin table into a stacked card, with each cell
 * prefixed by its column heading. The headings are copied onto the cells here, so the existing tables
 * need no individual changes. It re-runs when the page content changes (filters, saves, new rows).
 * Before it runs, a table simply scrolls sideways as it did before.
 */
function label() {
  for (const table of document.querySelectorAll<HTMLTableElement>("main table")) {
    const heads = [...table.querySelectorAll("thead th")].map((h) => h.textContent?.trim() ?? "");
    if (heads.length === 0) continue;
    table.classList.add("rtable");
    for (const row of table.querySelectorAll("tbody tr")) {
      [...row.children].forEach((cell, i) => {
        if (cell instanceof HTMLElement && heads[i] && !cell.dataset.label && !cell.hasAttribute("colspan")) cell.dataset.label = heads[i];
      });
    }
  }
}

export function RowLabels() {
  useEffect(() => {
    label();
    const main = document.getElementById("admin-main");
    if (!main) return;
    let frame = 0;
    const obs = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(label);
    });
    obs.observe(main, { childList: true, subtree: true });
    return () => { obs.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  return null;
}
