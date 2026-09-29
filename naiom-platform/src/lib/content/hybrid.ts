/**
 * Rendu des carrousels ÉDUCATIFS en HTML éditorial (style template) → PNG.
 * 100% déterministe : schémas de flux, avant/après, stats/graphs, tableaux d'outils,
 * listes illustrées, diagrammes. Vrais logos + icônes ligne. AUCUNE image générée,
 * aucune photo, aucun élément hors-sujet.
 */
import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";
import { getLogos, type Logo } from "./logos";
import { getIcons } from "./icons";
import type { T1Content, T1Slide } from "./type1";

const OUT_DIR = path.join(process.cwd(), "public", "content-out");
const W = 1080, H = 1350;
let ORANGE = "#BE5A34", VIOLET = "#5B4DEE", INK = "#211c16", PAPER = "#ECE3CE", CARD = "#F8F1E1", MUTE = "#877c68";

/** Thème visuel par template sélectionné (le clic sur un template change le look). */
function applyTheme(refId?: string): void {
  INK = "#211c16"; VIOLET = "#5B4DEE"; CARD = "#F8F1E1"; MUTE = "#877c68";
  const t = (refId || "").replace("ig-", "");
  if (t === "type2") { ORANGE = "#1F8A6D"; PAPER = "#F0E8D6"; VIOLET = "#C0453A"; }        // craft vert/rouge
  else if (t === "type3") { ORANGE = "#3A5B9E"; PAPER = "#EDE6D6"; VIOLET = "#BE5A34"; }   // bleu magicien
  else if (t === "type4") { ORANGE = "#C85A2A"; PAPER = "#ECE4D2"; VIOLET = "#5B4DEE"; }   // burnt orange + terminal
  else { ORANGE = "#BE5A34"; PAPER = "#ECE3CE"; VIOLET = "#5B4DEE"; }                        // type1 terracotta
}

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const A = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function iconTile(svg: string, color: string, bg: string, size = 68): string {
  const s = (svg || "").replace(/<svg /, `<svg style="width:${Math.round(size * 0.52)}px;height:${Math.round(size * 0.52)}px" `);
  return `<span class="itile" style="width:${size}px;height:${size}px;background:${bg};color:${color}">${s}</span>`;
}
function logoTile(l: Logo, size = 68): string {
  const inner = Math.round(size * 0.56);
  if (l.kind === "svgcolor" && l.svg) {
    const svg = l.svg.replace(/<svg /, `<svg preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%" `);
    return `<span class="itile" style="width:${size}px;height:${size}px;background:#fff;padding:${Math.round(size * 0.17)}px">${svg}</span>`;
  }
  if (l.kind === "img" && l.imgDataUrl) {
    return `<span class="itile" style="width:${size}px;height:${size}px;background:#fff;padding:${Math.round(size * 0.16)}px"><img src="${l.imgDataUrl}" style="width:100%;height:100%;object-fit:contain"/></span>`;
  }
  if (l.kind === "initial") {
    return `<span class="itile" style="width:${size}px;height:${size}px;background:${l.hex};color:#fff;font-family:Newsreader,serif;font-weight:800;font-size:${Math.round(size * 0.5)}px">${esc((l.name[0] || "•").toUpperCase())}</span>`;
  }
  const svg = (l.svg || "").replace(/fill="#[0-9a-fA-F]{3,6}"/, 'fill="#fff"').replace(/<svg /, `<svg style="width:${inner}px;height:${inner}px" `);
  return `<span class="itile" style="width:${size}px;height:${size}px;background:${l.hex}">${svg}</span>`;
}
function titleHTML(t: string, accent: string): string {
  const w = esc(t).split(" ");
  if (w.length < 2) return `<span style="color:${accent};font-style:italic">${w.join(" ")}</span>`;
  const last = w.pop();
  return `${w.join(" ")} <span style="color:${accent};font-style:italic">${last}</span>`;
}