/**
 * Store JSON des propositions commerciales de Idriss.
 * Fichier : {repo}/propositions/store.json.
 * Sert au tableau de bord de suivi (stats + graphes).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT } from "@/lib/paths";

export const PROPOSITIONS_DIR = path.join(REPO_ROOT, "propositions");
const STORE_FILE = path.join(PROPOSITIONS_DIR, "store.json");

export type PropStatus = "generated" | "sent";

export interface PropRecord {
  id: string;
  reference: string;
  prospect: string;
  sector: string;
  source: "lead" | "call";
  filename: string;
  totalSetup: number;      // € mise en place
  totalRecurring: number;  // €/mois
  solutionsCount: number;
  status: PropStatus;
  contactEmail?: string;
  createdAt: string;
  sentAt?: string;
}

interface Store { proposals: PropRecord[]; }

export async function readProposals(): Promise<PropRecord[]> {
  try {
    const raw = await fs.readFile(STORE_FILE, "utf-8");
    return (JSON.parse(raw) as Store).proposals ?? [];
  } catch {
    return [];
  }
}

async function writeProposals(proposals: PropRecord[]): Promise<void> {
  await fs.mkdir(PROPOSITIONS_DIR, { recursive: true });
  const tmp = `${STORE_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ proposals }, null, 2), "utf-8");
  await fs.rename(tmp, STORE_FILE);
}

let writeLock: Promise<unknown> = Promise.resolve();
function mutate<T>(fn: (p: PropRecord[]) => { proposals: PropRecord[]; result: T }): Promise<T> {
  const run = writeLock.then(async () => {
    const current = await readProposals();
    const { proposals, result } = fn(current);
    await writeProposals(proposals);
    return result;
  });
  writeLock = run.catch(() => undefined);
  return run;
}

export async function addProposal(rec: Omit<PropRecord, "id" | "createdAt" | "status"> & Partial<Pick<PropRecord, "status">>): Promise<PropRecord> {
  return mutate((proposals) => {
    // remplace un enregistrement existant pour le même PDF (régénération)
    const filtered = proposals.filter((p) => p.filename !== rec.filename);
    const record: PropRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      status: rec.status ?? "generated",
      ...rec,
    };
    return { proposals: [record, ...filtered], result: record };
  });
}

export async function markSent(filename: string, contactEmail: string): Promise<PropRecord | null> {
  return mutate((proposals) => {
    const i = proposals.findIndex((p) => p.filename === filename);
    if (i < 0) return { proposals, result: null };
    proposals[i] = { ...proposals[i], status: "sent", contactEmail, sentAt: new Date().toISOString() };
    return { proposals, result: proposals[i] };
  });
}
