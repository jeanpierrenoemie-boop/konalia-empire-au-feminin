export interface DriveSnapshot {
  totalFiles: number;
  recentFiles: Array<{ name: string; size: number; updated: string }>;
}

export async function fetchRecentDriveFiles(): Promise<DriveSnapshot> {
  return {
    totalFiles: 0,
    recentFiles: [],
  };
}

export function labelForMime(mimeType: string): string {
  const mimeLabels: Record<string, string> = {
    "application/vnd.google-apps.document": "Doc",
    "application/vnd.google-apps.spreadsheet": "Sheet",
    "application/vnd.google-apps.presentation": "Slide",
    "application/pdf": "PDF",
    "text/plain": "Text",
  };
  return mimeLabels[mimeType] || "File";
}
