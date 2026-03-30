// Netlify Function: LinkedIn Marketing API proxy
// Required env vars: LINKEDIN_ACCESS_TOKEN, LINKEDIN_AD_ACCOUNT_ID

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

  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const accountId = process.env.LINKEDIN_AD_ACCOUNT_ID;

  if (!accessToken || !accountId) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'LinkedIn API not configured. Set LINKEDIN_ACCESS_TOKEN and LINKEDIN_AD_ACCOUNT_ID.' })
    };
  }

  try {
    const params = event.queryStringParameters || {};
    const dateFrom = params.from || getDefaultFrom();
    const dateTo = params.to || getDefaultTo();

    // Step 1: Get campaigns list
    const campaignsUrl = `https://api.linkedin.com/rest/adAccounts/${accountId}/adCampaigns?q=search&status=ACTIVE,PAUSED,COMPLETED&count=100`;

    const campaignsRes = await fetch(campaignsUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'LinkedIn-Version': '202401',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    });
    const campaignsData = await campaignsRes.json();

    if (campaignsData.status && campaignsData.status >= 400) {
      return {
        statusCode: campaignsData.status, headers,
        body: JSON.stringify({ error: campaignsData.message || 'LinkedIn API error', platform: 'linkedin' })
      };
    }

    const campaigns = campaignsData.elements || [];
    const campaignMap = {};
    const campaignIds = [];

    campaigns.forEach((c) => {
      const id = c.id || extractId(c['$URN'] || '');
      if (id) {
        campaignMap[id] = c.name || `Campaign ${id}`;
        campaignIds.push(id);
      }
    });

    if (campaignIds.length === 0) {
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ platform: 'linkedin', entries: [], fetched: new Date().toISOString() })
      };
    }

    // Step 2: Get analytics for campaigns
    const startDate = parseDateParts(dateFrom);
    const endDate = parseDateParts(dateTo);

    const campaignUrns = campaignIds.map((id) => `urn:li:sponsoredCampaign:${id}`);
    const pivotParam = 'CAMPAIGN';
    const analyticsUrl = `https://api.linkedin.com/rest/adAnalytics`
      + `?q=analytics`
      + `&pivot=${pivotParam}`
      + `&dateRange=(start:(year:${startDate.year},month:${startDate.month},day:${startDate.day}),end:(year:${endDate.year},month:${endDate.month},day:${endDate.day}))`
      + `&timeGranularity=MONTHLY`
      + `&campaigns=${encodeURIComponent('List(' + campaignUrns.join(',') + ')')}`
      + `&fields=costInLocalCurrency,impressions,clicks,externalWebsiteConversions,dateRange,pivotValue`;

    const analyticsRes = await fetch(analyticsUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'LinkedIn-Version': '202401',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    });
    const analyticsData = await analyticsRes.json();

    if (analyticsData.status && analyticsData.status >= 400) {
      return {
        statusCode: analyticsData.status, headers,
        body: JSON.stringify({ error: analyticsData.message || 'LinkedIn Analytics API error', platform: 'linkedin' })
      };
    }

    // Normalize data
    const entries = (analyticsData.elements || []).map((row) => {
      const spend = parseFloat(row.costInLocalCurrency) || 0;
      const impressions = parseInt(row.impressions) || 0;
      const clicks = parseInt(row.clicks) || 0;
      const conversions = parseInt(row.externalWebsiteConversions) || 0;
      const dr = row.dateRange?.start || {};
      const monthStr = `${dr.year}-${String(dr.month).padStart(2, '0')}`;
      const campaignId = extractId(row.pivotValue || '');

      return {
        platform: 'linkedin',
        month: monthStr,
        campaign: campaignMap[campaignId] || `Campaign ${campaignId}`,
        spend: spend,
        impressions: impressions,
        clicks: clicks,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        conversions: conversions,
        revenue: 0, // LinkedIn API doesn't provide revenue directly
      };
    });

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ platform: 'linkedin', entries, fetched: new Date().toISOString() })
    };
  } catch (err) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: err.message, platform: 'linkedin' })
    };
  }
};

function extractId(urn) {
  const parts = urn.split(':');
  return parts[parts.length - 1];
}

function parseDateParts(dateStr) {
  const parts = dateStr.split('-');
  return {
    year: parseInt(parts[0]),
    month: parseInt(parts[1]),
    day: parseInt(parts[2] || '1'),
  };
}

function getDefaultFrom() {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().split('T')[0];
}

function getDefaultTo() {
  return new Date().toISOString().split('T')[0];
}
