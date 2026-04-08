/**
 * Rejestr.io REST API connector
 * Docs: rejestr.io/api
 * Auth: API key in Authorization header
 * Rate limit: 1000 req/min
 * Pricing: 0.05 PLN/req standard, 0.50 PLN/req for financial documents
 */

const BASE_URL = 'https://rejestr.io/api/v2';

interface RejestrIoConfig {
  apiKey: string;
}

export function createRejestrIoClient(config: RejestrIoConfig) {
  const headers = {
    'Authorization': config.apiKey,
    'Content-Type': 'application/json',
  };

  return {
    /** Search organization by NIP/KRS/name — 0.05 PLN */
    async searchOrganization(query: string) {
      const res = await fetch(`${BASE_URL}/org/search?q=${encodeURIComponent(query)}`, { headers });
      return res.json();
    },

    /** Advanced organization data (board, shareholders, PKD) — 0.05 PLN */
    async getOrganizationAdvanced(krs: string) {
      const res = await fetch(`${BASE_URL}/org/${krs}/advanced`, { headers });
      return res.json();
    },

    /** List available financial documents — 0.05 PLN */
    async listFinancialDocuments(krs: string) {
      const res = await fetch(`${BASE_URL}/org/${krs}/financial-documents`, { headers });
      return res.json();
    },

    /** Get a specific financial document — 0.50 PLN */
    async getFinancialDocument(krs: string, documentId: string) {
      const res = await fetch(`${BASE_URL}/org/${krs}/financial-documents/${documentId}`, { headers });
      return res.json();
    },

    /** Organization connections/graph — 0.05 PLN */
    async getOrganizationConnections(krs: string) {
      const res = await fetch(`${BASE_URL}/org/${krs}/connections`, { headers });
      return res.json();
    },
  };
}
