/**
 * Meta Ad Library API connector (free, no cost)
 * Returns all active ads for a given page/advertiser
 */

interface MetaAdsConfig {
  accessToken: string;
}

export function createMetaAdsClient(config: MetaAdsConfig) {
  const BASE_URL = 'https://graph.facebook.com/v18.0';

  return {
    /** Search ads by page name or advertiser */
    async searchAds(params: {
      searchTerms?: string;
      adReachedCountries: string[];
      adType?: 'ALL' | 'POLITICAL_AND_ISSUE_ADS';
    }) {
      const query = new URLSearchParams({
        access_token: config.accessToken,
        ad_reached_countries: JSON.stringify(params.adReachedCountries),
        ad_type: params.adType || 'ALL',
        search_terms: params.searchTerms || '',
        fields: 'id,ad_creative_bodies,ad_creative_link_titles,ad_delivery_start_time,ad_delivery_stop_time,page_name,publisher_platforms',
      });
      const res = await fetch(`${BASE_URL}/ads_archive?${query}`);
      return res.json();
    },
  };
}
