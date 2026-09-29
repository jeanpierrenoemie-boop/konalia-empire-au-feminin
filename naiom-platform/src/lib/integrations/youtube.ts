export interface YTSnapshot {
  channel: {
    name: string;
    subscribers: number;
  };
  analytics: {
    totals: {
      subscribersGained: number;
    };
  };
}

export async function fetchYouTubeSnapshot(): Promise<YTSnapshot> {
  return {
    channel: {
      name: "",
      subscribers: 0,
    },
    analytics: {
      totals: {
        subscribersGained: 0,
      },
    },
  };
}
