/**
 * Rendu PDF PRO d'une proposition commerciale NAIOM (Victor).
 * A4. Couverture pleine + contenu en FLUX CONTINU (pas de sauts de page rigides →
 * aucune demi-page blanche), schémas de process, blocs before→after, tableau
 * d'investissement, planning. L'email n'est PAS dans le PDF.
 */
import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";
import { DELIVERABLE_FOLDERS } from "@/lib/paths";
import type { Proposal, Solution } from "./proposal";

const C = { orange: "#F5411C", violet: "#5B4DEE", ink: "#141414", soft: "#5b6170", line: "#e8e8ee", wash: "#FAF6F4" };
const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function flow(steps: string[], variant: "muted" | "accent"): string {
  const bg = variant === "accent" ? "#EEF0FF" : "#F3F3F6";
  const bd = variant === "accent" ? C.violet : "#c9ccd6";
  const fg = variant === "accent" ? C.violet : "#4a4f5c";
  return `<div class="flow">${steps
    .map((s, i) => `<div class="node" style="background:${bg};border-color:${bd};color:${fg}">${esc(s)}</div>` + (i < steps.length - 1 ? `<div class="arrow" style="color:${bd}">→</div>` : ""))
    .join("")}</div>`;
}

function solutionBlock(s: Solution, i: number): string {
  return `<section class="sol">
    <div class="sol-head"><span class="sol-num">${i + 1}</span><h3>${esc(s.title)}</h3></div>
    <p class="sol-problem"><b>Problème :</b> ${esc(s.problem)}</p>
    <p class="sol-how">${esc(s.how)}</p>
    <div class="ba">
      <div><div class="ba-label ba-before">Aujourd'hui — manuel</div>${flow(s.before, "muted")}</div>
      <div style="margin-top:8px"><div class="ba-label ba-after">Avec NAIOM — automatisé</div>${flow(s.after, "accent")}</div>
    </div>
    <div class="sol-foot">
      <div class="tools">${s.tools.map((t) => `<span class="tool">${esc(t)}</span>`).join("")}</div>
      <div class="gain">⚡ ${esc(s.gain)}</div>
    </div>
    <div class="sol-price"><span>Mise en place <b>${eur(s.setup)}</b></span>${s.recurring ? `<span>Maintenance <b>${eur(s.recurring)}/mois</b></span>` : ""}</div>
  </section>`;
}

function renderHTML(p: Proposal): string {
  const highlights = p.solutions.slice(0, 3).map((s) => esc(s.title));
  const totalMonthly = p.pricing.totalRecurring ? ` <span class="sub">+ ${eur(p.pricing.totalRecurring)}/mois</span>` : "";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>