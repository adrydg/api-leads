import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

/**
 * Health check endpoint
 * GET /api/health
 */
export async function GET() {
  const checks = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {} as Record<string, { status: string; message?: string; latency?: number }>,
  };

  // 1. Check Supabase connection
  try {
    const startSupabase = Date.now();
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('leads')
      .select('id')
      .limit(1);

    const latency = Date.now() - startSupabase;

    if (error) {
      checks.checks.supabase = {
        status: 'unhealthy',
        message: error.message,
        latency,
      };
      checks.status = 'degraded';
    } else {
      checks.checks.supabase = {
        status: 'healthy',
        latency,
      };
    }
  } catch (error) {
    checks.checks.supabase = {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    checks.status = 'unhealthy';
  }

  // 2. Check environment variables
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'WEBHOOK_SECRET',
    'ALLOWED_ORIGINS',
    'API_KEYS',
  ];

  const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);

  if (missingEnvVars.length > 0) {
    checks.checks.environment = {
      status: 'unhealthy',
      message: `Missing: ${missingEnvVars.join(', ')}`,
    };
    checks.status = 'unhealthy';
  } else {
    checks.checks.environment = {
      status: 'healthy',
    };
  }

  // 3. Check recent leads (last 5 minutes)
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('leads')
      .select('id, created_at')
      .gte('created_at', fiveMinutesAgo);

    if (error) {
      checks.checks.recent_activity = {
        status: 'warning',
        message: error.message,
      };
    } else {
      checks.checks.recent_activity = {
        status: 'healthy',
        message: `${data?.length || 0} leads in last 5 minutes`,
      };
    }
  } catch (error) {
    checks.checks.recent_activity = {
      status: 'warning',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Return appropriate status code
  const statusCode = checks.status === 'healthy' ? 200 :
                     checks.status === 'degraded' ? 207 : 503;

  return NextResponse.json(checks, { status: statusCode });
}
