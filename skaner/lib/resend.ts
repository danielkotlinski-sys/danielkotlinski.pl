import { Resend } from 'resend';

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

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
  try {
    await getResend().emails.send({
      from: 'Skaner Kategorii <skaner@danielkotlinski.pl>',
      to,
      subject: `Raport: konwencje kategorii dla ${props.brandName}`,
      html: buildEmailHtml(props),
    });
  } catch (error) {
    console.error('Failed to send report email:', error);
  }
}

function buildEmailHtml(props: ReportEmailProps): string {
  return `
<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a; line-height: 1.6;">

  <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 8px;">
    Raport Skanu Kategorii
  </h1>
  <p style="color: #666; margin-top: 0;">
    Przygotowany dla: ${props.brandName}
  </p>

  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />

  <p>Cześć ${props.firstName},</p>

  <p>Twój Skan Kategorii jest gotowy. Oto najważniejsze wnioski:</p>

  <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 24px 0;">
    <p style="margin-top: 0;"><strong>Mechanizm kategorii:</strong><br/>
    ${props.categoryMechanism}</p>

    <p><strong>Pozycja Twojej marki:</strong><br/>
    ${props.clientPositionSummary}</p>

    <p style="margin-bottom: 0;"><strong>Pytanie otwarte:</strong><br/>
    <em>${props.openQuestion}</em></p>
  </div>

  <a href="${props.reportUrl}" style="display: inline-block; background: #1a1a1a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 500;">
    Zobacz pełny raport →
  </a>

  <p style="margin-top: 32px; font-size: 14px; color: #666;">
    Raport będzie dostępny pod tym linkiem przez 30 dni.
  </p>

  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;" />

  <p style="font-size: 14px; color: #999;">
    Konwencja pokazuje jak kategoria konkuruje dziś. Nie mówi nic o tym,
    czy ta logika odpowiada na to czego klienci naprawdę szukają.
    <br/><br/>
    Chcesz wiedzieć więcej? <a href="https://danielkotlinski.pl/kontakt" style="color: #1a1a1a;">Umów bezpłatną rozmowę</a>.
  </p>

</body>
</html>
  `.trim();
}
