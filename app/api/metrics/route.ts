import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

/**
 * Metrics endpoint
 * GET /api/metrics?timeframe=24h
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const timeframe = searchParams.get('timeframe') || '24h';

  // Parse timeframe
  const timeframeMap: Record<string, number> = {
    '1h': 1 * 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };

  const milliseconds = timeframeMap[timeframe] || timeframeMap['24h'];
  const startTime = new Date(Date.now() - milliseconds).toISOString();

  try {
    const supabase = getSupabaseClient();

    // Get leads within timeframe
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id, source, status, created_at, metadata')
      .gte('created_at', startTime)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch metrics', details: error.message },
        { status: 500 }
      );
    }

    // Calculate metrics
    const totalLeads = leads?.length || 0;

    // Group by source
    const bySource: Record<string, number> = {};
    leads?.forEach(lead => {
      const source = lead.source || 'unknown';
      bySource[source] = (bySource[source] || 0) + 1;
    });

    // Group by status
    const byStatus: Record<string, number> = {};
    leads?.forEach(lead => {
      const status = lead.status || 'unknown';
      byStatus[status] = (byStatus[status] || 0) + 1;
    });

    // Group by hour (last 24h)
    const byHour: Record<string, number> = {};
    leads?.forEach(lead => {
      const hour = new Date(lead.created_at).toISOString().slice(0, 13);
      byHour[hour] = (byHour[hour] || 0) + 1;
    });

    // Calculate average leads per hour
    const hours = Object.keys(byHour).length || 1;
    const avgPerHour = (totalLeads / hours).toFixed(2);

    return NextResponse.json({
      timeframe,
      startTime,
      endTime: new Date().toISOString(),
      summary: {
        totalLeads,
        avgPerHour: parseFloat(avgPerHour),
      },
      breakdown: {
        bySource,
        byStatus,
        byHour,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
