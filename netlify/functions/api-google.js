// Netlify Function: Google Ads API proxy
// Required env vars: GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID,
//   GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_CUSTOMER_ID

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
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
    const tokenBody = 'client_id=' + encodeURIComponent(clientId)
      + '&client_secret=' + encodeURIComponent(clientSecret)
      + '&refresh_token=' + encodeURIComponent(refreshToken)
      + '&grant_type=refresh_token';

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return {
        statusCode: 401, headers,
        body: JSON.stringify({ error: 'Failed to refresh Google access token: ' + JSON.stringify(tokenData), platform: 'google' })
      };
    }

    // Step 2: Query campaign performance via Google Ads API (REST)
    const params = event.queryStringParameters || {};
    const dateFrom = params.from || getDefaultFrom();
    const dateTo = params.to || getDefaultTo();

    const query = 'SELECT campaign.name, segments.month, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.average_cpm, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN "' + dateFrom + '" AND "' + dateTo + '" AND campaign.status != "REMOVED" ORDER BY segments.month DESC';

    const cleanCustomerId = customerId.replace(/-/g, '');

    // Try multiple API versions
    var apiVersions = ['v19', 'v18', 'v17', 'v16'];
    var searchText;
    var searchRes;
    var searchOk = false;

    for (var i = 0; i < apiVersions.length; i++) {
      var searchUrl = 'https://googleads.googleapis.com/' + apiVersions[i] + '/customers/' + cleanCustomerId + '/googleAds:search';

      searchRes = await fetch(searchUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + tokenData.access_token,
          'developer-token': devToken,
          'login-customer-id': cleanCustomerId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: query, pageSize: 1000 }),
      });

      searchText = await searchRes.text();
      if (searchRes.status !== 404) {
        searchOk = true;
        break;
      }
    }

    if (!searchOk) {
      return {
        statusCode: 404, headers,
        body: JSON.stringify({ error: 'Google Ads API returned 404 for all versions (v16-v19). Check your GOOGLE_ADS_CUSTOMER_ID and developer token access level.', platform: 'google' })
      };
    }
    var searchData;
    try {
      searchData = JSON.parse(searchText);
    } catch (e) {
      return {
        statusCode: 500, headers,
        body: JSON.stringify({ error: 'Google API returned invalid JSON: ' + searchText.substring(0, 200), platform: 'google' })
      };
    }

    if (searchData.error) {
      return {
        statusCode: 400, headers,
        body: JSON.stringify({ error: searchData.error.message || JSON.stringify(searchData.error), platform: 'google' })
      };
    }

    // Normalize data — searchStream returns an array of batches
    const entries = [];
    var batches = Array.isArray(searchData) ? searchData : [searchData];

    batches.forEach(function (batch) {
      var results = (batch && batch.results) ? batch.results : [];
      results.forEach(function (row) {
        var m = row.metrics || {};
        var seg = row.segments || {};
        var camp = row.campaign || {};
        var spendZl = (parseInt(m.costMicros || m.cost_micros || '0') || 0) / 1000000;

        entries.push({
          platform: 'google',
          month: seg.month || '',
          campaign: camp.name || '',
          spend: spendZl,
          impressions: parseInt(m.impressions || '0') || 0,
          clicks: parseInt(m.clicks || '0') || 0,
          ctr: (parseFloat(m.ctr || '0') || 0) * 100,
          cpc: (parseInt(m.averageCpc || m.average_cpc || '0') || 0) / 1000000,
          cpm: (parseInt(m.averageCpm || m.average_cpm || '0') || 0) / 1000000,
          conversions: parseFloat(m.conversions || '0') || 0,
          revenue: parseFloat(m.conversionsValue || m.conversions_value || '0') || 0,
        });
      });
    });

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ platform: 'google', entries: entries, fetched: new Date().toISOString() })
    };
  } catch (err) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: err.message, platform: 'google' })
    };
  }
};

function getDefaultFrom() {
  var d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().split('T')[0];
}

function getDefaultTo() {
  return new Date().toISOString().split('T')[0];
}
