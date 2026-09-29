export interface GmailMessage {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

export async function fetchGmailInbox(): Promise<GmailMessage[]> {
  return [];
}
