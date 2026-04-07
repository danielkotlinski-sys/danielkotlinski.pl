/**
 * API: Cross-Analysis Engine
 *
 * GET  /api/analysis          — list available analyses
 * GET  /api/analysis?id=X     — run single analysis
 * GET  /api/analysis?id=all   — run all 5 analyses
 * GET  /api/analysis?id=brands — export flattened brand rows
 */

import { NextResponse } from 'next/server';
import {
  ANALYSIS_LIST,
  runAnalysis,
  runAllAnalyses,
  exportBrandRows,
} from '@/lib/analysis';
import type { AnalysisId } from '@/lib/analysis';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  try {
    // List available analyses
    if (!id) {
      return NextResponse.json({
        analyses: ANALYSIS_LIST,
        usage: 'GET /api/analysis?id=<analysis-id> or ?id=all or ?id=brands',
      });
    }

    // Export flattened brand data
    if (id === 'brands') {
      const rows = exportBrandRows();
      return NextResponse.json({
        brandCount: rows.length,
        brands: rows,
      });
    }

    // Run all analyses
    if (id === 'all') {
      const results = runAllAnalyses();
      return NextResponse.json({
        analysisCount: Object.keys(results).length,
        results,
      });
    }

    // Run single analysis
    const validIds = ANALYSIS_LIST.map(a => a.id);
    if (!validIds.includes(id as AnalysisId)) {
      return NextResponse.json(
        { error: `Unknown analysis: ${id}. Valid: ${validIds.join(', ')}` },
        { status: 400 }
      );
    }

    const result = runAnalysis(id as AnalysisId);
    return NextResponse.json(result);

  } catch (err) {
    console.error('[analysis] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
