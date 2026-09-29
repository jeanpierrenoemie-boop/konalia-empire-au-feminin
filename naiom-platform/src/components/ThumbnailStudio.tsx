"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { cn } from "@/lib/utils";

interface FaceRef {
  name: string;
  sizeLabel: string;
  bytes: number;
}

interface Thumb {
  label: string;
  visualUrl: string;
  finalUrl: string;
  prompt: string;
}

interface RefsResponse {
  found: boolean;
  faces: FaceRef[];
  error?: string;
}

const ANGLE_PRESETS = [
  "Confiant, regard caméra",
  "Surpris / choqué",
  "Sourire enthousiaste",
  "Sérieux, intense",
  "Curieux, intrigué",
];

export function ThumbnailStudio() {
  const [faces, setFaces] = useState<FaceRef[]>([]);
  const [refError, setRefError] = useState<string | null>(null);
  const [loadingRefs, setLoadingRefs] = useState(true);

  const [title, setTitle] = useState("");
  const [angle, setAngle] = useState("");
  const [selectedFace, setSelectedFace] = useState<string>("");

  const [generating, setGenerating] = useState(false);
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  const [genError, setGenError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/youtube-thumbnail/references")
      .then((r) => r.json())
      .then((data: RefsResponse) => {
        if (cancelled) return;
        if (!data.found || data.faces.length === 0) {
          setRefError(data.error || "Aucune photo dans le dossier MINIATURE.");
        } else {
          setFaces(data.faces);
          setSelectedFace(data.faces[0].name);
        }
      })
      .catch((e) => !cancelled && setRefError(e instanceof Error ? e.message : "Erreur"))
      .finally(() => !cancelled && setLoadingRefs(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const generate = async () => {
    if (title.trim().length < 2 || generating) return;
    setGenerating(true);
    setGenError(null);
    setThumbs([]);
    try {
      const res = await fetch("/api/youtube-thumbnail/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          angle: angle.trim() || undefined,
          referenceName: selectedFace || undefined,
          count: 3,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setThumbs(data.thumbnails ?? []);
      if (data.errors?.length) {
        setGenError(
          `${data.errors.length} composition(s) en échec — affichage des réussies.`
        );
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Erreur de génération");
    } finally {
      setGenerating(false);
    }
  };

  const canGenerate = title.trim().length >= 2 && !generating && faces.length > 0;

  return (
    <div className="space-y-5">
      {/* ===== Formulaire ===== */}
      <div className="glass-brutal rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ background: "#E8461F" }}>
            <Icon name="Image" size={16} />
          </div>
          <div>
            <h3 className="text-[15px] font-bold text-[var(--color-ink)]">Miniature YouTube</h3>
            <p className="text-[11px] text-[var(--color-ink-soft)]">
              Ton visage (dossier MINIATURE) composé dans 3 miniatures 1280×720, titre incrusté net.
            </p>
          </div>
        </div>
