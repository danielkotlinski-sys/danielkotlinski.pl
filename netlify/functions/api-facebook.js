// Netlify Function: Facebook (Meta) Marketing API proxy
// Required env vars: META_ACCESS_TOKEN, META_AD_ACCOUNT_ID

const API_VERSION = 'v21.0';

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

  // Verify dashboard auth token
  const authToken = event.headers['x-dashboard-token'];
  if (!authToken || authToken !== process.env.DASHBOARD_SECRET) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const accessToken = process.env.META_ACCESS_TOKEN;
  const accountId = process.env.META_AD_ACCOUNT_ID;

  if (!accessToken || !accountId) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'Meta API not configured. Set META_ACCESS_TOKEN and META_AD_ACCOUNT_ID.' })
    };
  }

  try {
    const params = event.queryStringParameters || {};
    const dateFrom = params.from || getDefaultFrom();
    const dateTo = params.to || getDefaultTo();

    const url = `https://graph.facebook.com/${API_VERSION}/act_${accountId}/insights`
      + `?access_token=${accessToken}`
      + `&level=campaign`
      + `&fields=campaign_name,spend,impressions,clicks,ctr,cpc,cpm,actions,action_values`
      + `&time_range={"since":"${dateFrom}","until":"${dateTo}"}`
      + `&time_increment=monthly`
      + `&limit=500`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      return {
        statusCode: 400, headers,
        body: JSON.stringify({ error: data.error.message, platform: 'facebook' })
      };
    }

    // Normalize data to common format
    const entries = (data.data || []).map((row) => {
      const conversions = getActionValue(row.actions, 'offsite_conversion');
      const revenue = getActionValue(row.action_values, 'offsite_conversion');

      return {
        platform: 'facebook',
        month: row.date_start.substring(0, 7),
        campaign: row.campaign_name,
        spend: parseFloat(row.spend) || 0,
        impressions: parseInt(row.impressions) || 0,
        clicks: parseInt(row.clicks) || 0,
        ctr: parseFloat(row.ctr) || 0,
        cpc: parseFloat(row.cpc) || 0,
        cpm: parseFloat(row.cpm) || 0,
        conversions: conversions,
        revenue: revenue,
      };
    });

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ platform: 'facebook', entries, fetched: new Date().toISOString() })
    };
  } catch (err) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: err.message, platform: 'facebook' })
    };
  }
};

function getActionValue(actions, actionType) {
  if (!actions) return 0;
  const match = actions.find((a) => a.action_type === actionType);
  return match ? parseFloat(match.value) || 0 : 0;
}

function getDefaultFrom() {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().split('T')[0];
}

function getDefaultTo() {
  return new Date().toISOString().split('T')[0];
}
