import type { Lead } from '@/types/scanner';

const LOOPS_API_URL = 'https://app.loops.so/api/v1';

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.LOOPS_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

// === Save lead as Loops contact ===

export async function saveLead(lead: Lead): Promise<void> {
  if (!process.env.LOOPS_API_KEY) {
    console.error('LOOPS_API_KEY missing, skipping lead save');
    return;
  }

  try {
    const contactData = {
      email: lead.email,
      firstName: lead.firstName,
      source: 'skaner-kategorii',
      subscribed: lead.gdprConsent,
      firma: lead.company || '',
      markaKlienta: lead.scanInput.clientBrand.name,
      kategoria: lead.scanInput.category,
      typKategorii: lead.scanInput.categoryType,
      scanId: lead.scanId,
      reportUrl: lead.reportUrl,
    };

    // Try update first (works for existing + new contacts)
    const response = await fetch(`${LOOPS_API_URL}/contacts/update`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(contactData),
    });

    if (!response.ok) {
      // Fallback to create if update fails
      const createResponse = await fetch(`${LOOPS_API_URL}/contacts/create`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(contactData),
      });

      if (!createResponse.ok) {
        const error = await createResponse.text();
        console.error('Loops contact save failed:', error);
      }
    }
  } catch (error) {
    console.error('Loops contact create error:', error);
  }
}

// === Send report email via Loops transactional ===

interface ReportEmailProps {
  firstName: string;
  brandName: string;
  categoryMechanism: string;
  clientPositionSummary: string;
  openQuestion: string;
  reportUrl: string;
}

export async function sendReportEmail(
  to: string,
  props: ReportEmailProps
): Promise<void> {
  if (!process.env.LOOPS_API_KEY || !process.env.LOOPS_TRANSACTIONAL_ID) {
    console.error('Loops credentials missing, skipping email');
    return;
  }

  try {
    const response = await fetch(`${LOOPS_API_URL}/transactional`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        transactionalId: process.env.LOOPS_TRANSACTIONAL_ID,
        email: to,
        dataVariables: {
          name: props.firstName,
          firstName: props.firstName,
          brandName: props.brandName,
          categoryMechanism: props.categoryMechanism,
          clientPositionSummary: props.clientPositionSummary,
          openQuestion: props.openQuestion,
          reportUrl: props.reportUrl,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Loops transactional email failed:', error);
    }
  } catch (error) {
    console.error('Loops email send error:', error);
  }
}
