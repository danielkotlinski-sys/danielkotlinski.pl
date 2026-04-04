/**
 * Apify connector — used for web crawling, social media scraping, reviews
 * Multiple actors used across different pipeline phases
 */

interface ApifyConfig {
  apiToken: string;
}

export function createApifyClient(config: ApifyConfig) {
  const baseHeaders = {
    'Authorization': `Bearer ${config.apiToken}`,
    'Content-Type': 'application/json',
  };

  return {
    /** Run an Apify actor and wait for results */
    async runActor(actorId: string, input: Record<string, unknown>) {
      const res = await fetch(
        `https://api.apify.com/v2/acts/${actorId}/runs`,
        {
          method: 'POST',
          headers: baseHeaders,
          body: JSON.stringify(input),
        }
      );
      const run = await res.json();
      // TODO: poll for completion, then fetch dataset
      return run;
    },

    /** Fetch dataset items from a completed run */
    async getDatasetItems(datasetId: string) {
      const res = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items`,
        { headers: baseHeaders }
      );
      return res.json();
    },
  };
}
