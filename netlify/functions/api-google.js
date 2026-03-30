// Netlify Function: Google Ads API proxy
// Required env vars: GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID,
//   GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_CUSTOMER_ID

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': 'https://danielkotlinski.pl',
    'Access-Control-Allow-Headers': 'Content-Type, X-Dashboard-Token',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const authToken = event.headers['x-dashboard-token'];
  if (!authToken || authToken !== process.env.DASHBOARD_SECRET) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;

  if (!devToken || !clientId || !clientSecret || !refreshToken || !customerId) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'Google Ads API not configured. Set all GOOGLE_ADS_* env vars.' })
    };
  }

  try {
    // Step 1: Get access token via refresh token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return {
        statusCode: 401, headers,
        body: JSON.stringify({ error: 'Failed to refresh Google access token', platform: 'google' })
      };
    }

    // Step 2: Query campaign performance via Google Ads API (REST)
    const params = event.queryStringParameters || {};
    const dateFrom = (params.from || getDefaultFrom()).replace(/-/g, '');
    const dateTo = (params.to || getDefaultTo()).replace(/-/g, '');

    // Use GAQL (Google Ads Query Language)
    const query = `
      SELECT
        campaign.name,
        segments.month,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.average_cpc,
        metrics.average_cpm,
        metrics.conversions,
        metrics.conversions_value
      FROM campaign
      WHERE segments.date BETWEEN '${dateFrom.substring(0,4)}-${dateFrom.substring(4,6)}-${dateFrom.substring(6,8)}'
        AND '${dateTo.substring(0,4)}-${dateTo.substring(4,6)}-${dateTo.substring(6,8)}'
        AND campaign.status != 'REMOVED'
      ORDER BY segments.month DESC
    `;

    const cleanCustomerId = customerId.replace(/-/g, '');
    const searchUrl = `https://googleads.googleapis.com/v18/customers/${cleanCustomerId}/googleAds:searchStream`;

    const searchRes = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'developer-token': devToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    const searchData = await searchRes.json();

    if (searchData.error) {
      return {
        statusCode: 400, headers,
        body: JSON.stringify({ error: searchData.error.message, platform: 'google' })
      };
    }

    // Normalize data
    const entries = [];
    const results = searchData[0]?.results || searchData.results || [];

    results.forEach((row) => {
      const m = row.metrics || {};
      const spendZl = (parseInt(m.cost_micros) || 0) / 1000000;

      entries.push({
        platform: 'google',
        month: row.segments?.month || '',
        campaign: row.campaign?.name || '',
        spend: spendZl,
        impressions: parseInt(m.impressions) || 0,
        clicks: parseInt(m.clicks) || 0,
        ctr: (parseFloat(m.ctr) || 0) * 100,
        cpc: (parseInt(m.average_cpc) || 0) / 1000000,
        cpm: (parseInt(m.average_cpm) || 0) / 1000000,
        conversions: parseFloat(m.conversions) || 0,
        revenue: parseFloat(m.conversions_value) || 0,
      });
    });

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ platform: 'google', entries, fetched: new Date().toISOString() })
    };
  } catch (err) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: err.message, platform: 'google' })
    };
  }
};

function getDefaultFrom() {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().split('T')[0];
}

function getDefaultTo() {
  return new Date().toISOString().split('T')[0];
}
