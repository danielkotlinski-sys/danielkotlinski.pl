import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-admin-secret');
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { getRedisRaw } = await import('@/lib/redis');
  const r = await getRedisRaw();
  if (!r) return Response.json({ months: [], scans: [] });

  // Get specific scan costs if scanId provided
  const scanId = request.nextUrl.searchParams.get('scanId');
  if (scanId) {
    const data = await r.get(`scan:${scanId}:costs`);
    if (!data) return Response.json({ error: 'No cost data' }, { status: 404 });
    return Response.json(JSON.parse(data));
  }

  // Otherwise return monthly aggregates
  const months = await r.smembers('costs:months');
  const monthlyData: Array<{
    month: string;
    totalUsd: number;
    scanCount: number;
    byProvider: { anthropic: number; perplexity: number; jina: number; apify: number };
  }> = [];

  for (const month of months.sort().reverse().slice(0, 6)) {
    const entries = await r.lrange(`costs:${month}`, 0, -1);
    const scans = entries.map((e) => JSON.parse(e));
    const agg = { anthropic: 0, perplexity: 0, jina: 0, apify: 0 };
    let total = 0;
    for (const scan of scans) {
      total += scan.totalUsd || 0;
      for (const provider of Object.keys(agg) as Array<keyof typeof agg>) {
        agg[provider] += scan.byProvider?.[provider] || 0;
      }
    }
    monthlyData.push({
      month,
      totalUsd: total,
      scanCount: scans.length,
      byProvider: agg,
    });
  }

  // Recent individual scans (last 20)
  const latestMonth = months.sort().reverse()[0];
  let recentScans: Array<{ scanId: string; totalUsd: number; byProvider: Record<string, number>; createdAt: string }> = [];
  if (latestMonth) {
    const entries = await r.lrange(`costs:${latestMonth}`, 0, -1);
    recentScans = entries.map((e) => JSON.parse(e)).reverse().slice(0, 20);
  }

  return Response.json({ months: monthlyData, recentScans });
}
