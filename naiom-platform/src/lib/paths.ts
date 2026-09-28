import path from "node:path";

export const REPO_ROOT = path.resolve(process.cwd(), "..");

export const PATHS = {
  agents: path.join(REPO_ROOT, ".claude", "agents"),
  briefs: path.join(REPO_ROOT, "briefs"),
  content: path.join(REPO_ROOT, "content"),
};

