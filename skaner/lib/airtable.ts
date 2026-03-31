import type { Lead } from '@/types/scanner';

const AIRTABLE_API_URL = 'https://api.airtable.com/v0';

export async function saveLead(lead: Lead): Promise<void> {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME || 'leads';
  const apiKey = process.env.AIRTABLE_API_KEY;

  if (!baseId || !apiKey) {
    console.error('Airtable credentials missing, skipping lead save');
    return;
  }

  const url = `${AIRTABLE_API_URL}/${baseId}/${encodeURIComponent(tableName)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      records: [
        {
          fields: {
            ID: lead.id,
            'Imię': lead.firstName,
            Email: lead.email,
            Firma: lead.company || '',
            'Zgoda RODO': lead.gdprConsent,
            'Marka klienta': lead.scanInput.clientBrand.name,
            Kategoria: lead.scanInput.category,
            'Typ kategorii': lead.scanInput.categoryType,
            'Liczba konkurentów': lead.scanInput.competitors.length,
            'Scan ID': lead.scanId,
            'URL raportu': lead.reportUrl,
            'Data utworzenia': lead.createdAt,
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Airtable save failed:', error);
  }
}
