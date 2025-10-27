import { getSupabaseClient } from '@/lib/supabase';

async function getHealthData() {
  const checks: Record<string, { status: 'ok' | 'error'; message?: string; latency?: number }> = {};

  try {
    const supabase = getSupabaseClient();

    // Check 1: Database connection
    try {
      const startDb = Date.now();
      const { error: dbError } = await supabase.from('leads').select('id').limit(1);
      const latency = Date.now() - startDb;

      if (dbError) {
        checks.database = { status: 'error', message: dbError.message, latency };
      } else {
        checks.database = { status: 'ok', latency };
      }
    } catch (dbErr) {
      checks.database = { status: 'error', message: dbErr instanceof Error ? dbErr.message : 'Connection failed' };
    }

    // Check 2: Environment variables
    const requiredEnvVars = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'WEBHOOK_SECRET'];
    const missingVars = requiredEnvVars.filter(v => !process.env[v]);

    if (missingVars.length > 0) {
      checks.environment = { status: 'error', message: `Missing: ${missingVars.join(', ')}` };
    } else {
      checks.environment = { status: 'ok' };
    }

    // Get recent leads
    const { data: recentLeads, error: leadsError } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (leadsError) {
      checks.recent_leads = { status: 'error', message: leadsError.message };
    } else {
      checks.recent_leads = { status: 'ok', message: `${recentLeads?.length || 0} leads fetched` };
    }

    // Get stats for last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: last24h } = await supabase
      .from('leads')
      .select('id, source, created_at')
      .gte('created_at', oneDayAgo);

    // Get stats for last 5 minutes (recent activity)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: last5min } = await supabase
      .from('leads')
      .select('id')
      .gte('created_at', fiveMinutesAgo);

    // Get stats for last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: last7days } = await supabase
      .from('leads')
      .select('id, created_at')
      .gte('created_at', sevenDaysAgo);

    // Get stats by source
    const bySource: Record<string, number> = {};
    last24h?.forEach(lead => {
      const source = lead.source || 'unknown';
      bySource[source] = (bySource[source] || 0) + 1;
    });

    // Get distribution by hour (last 24h)
    const byHour: Record<number, number> = {};
    last24h?.forEach(lead => {
      const hour = new Date(lead.created_at).getHours();
      byHour[hour] = (byHour[hour] || 0) + 1;
    });

    // Get daily average (last 7 days)
    const dailyAvg = last7days ? (last7days.length / 7).toFixed(1) : '0';

    const hasErrors = Object.values(checks).some(c => c.status === 'error');

    return {
      healthy: !hasErrors,
      checks,
      recentLeads: recentLeads || [],
      stats: {
        total24h: last24h?.length || 0,
        last5min: last5min?.length || 0,
        last7days: last7days?.length || 0,
        dailyAvg,
        bySource,
        byHour,
      },
    };
  } catch (error) {
    checks.system = { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };

    return {
      healthy: false,
      checks,
      recentLeads: [],
      stats: {
        total24h: 0,
        last5min: 0,
        last7days: 0,
        dailyAvg: '0',
        bySource: {},
        byHour: {},
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export default async function DashboardPage() {
  const data = await getHealthData();

  return (
    <html lang="es">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Dashboard - API Leads Monitor</title>
        <style>{`
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #333;
            padding: 20px;
            min-height: 100vh;
          }

          .container {
            max-width: 1400px;
            margin: 0 auto;
          }

          header {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            margin-bottom: 30px;
          }

          h1 {
            font-size: 2.5rem;
            color: #667eea;
            margin-bottom: 10px;
          }

          .subtitle {
            color: #666;
            font-size: 1.1rem;
          }

          .status-badge {
            display: inline-block;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 0.9rem;
            margin-top: 15px;
          }

          .status-healthy {
            background: #d4edda;
            color: #155724;
          }

          .status-error {
            background: #f8d7da;
            color: #721c24;
          }

          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
          }

          .card {
            background: white;
            padding: 25px;
            border-radius: 15px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.1);
          }

          .card h2 {
            font-size: 1.3rem;
            color: #667eea;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
          }

          .metric {
            font-size: 3rem;
            font-weight: bold;
            color: #667eea;
            margin: 10px 0;
          }

          .metric-label {
            color: #666;
            font-size: 0.9rem;
          }

          .source-item {
            display: flex;
            justify-content: space-between;
            padding: 12px;
            background: #f8f9fa;
            border-radius: 8px;
            margin-bottom: 8px;
          }

          .source-name {
            color: #333;
            font-weight: 500;
          }

          .source-count {
            background: #667eea;
            color: white;
            padding: 4px 12px;
            border-radius: 12px;
            font-weight: bold;
          }

          .leads-table {
            width: 100%;
            border-collapse: collapse;
          }

          .leads-table th {
            background: #f8f9fa;
            padding: 12px;
            text-align: left;
            font-weight: 600;
            color: #666;
            border-bottom: 2px solid #dee2e6;
          }

          .leads-table td {
            padding: 12px;
            border-bottom: 1px solid #dee2e6;
          }

          .leads-table tr:hover {
            background: #f8f9fa;
          }

          .time-ago {
            color: #666;
            font-size: 0.85rem;
          }

          .checks-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
            margin-top: 20px;
          }

          .check-item {
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid;
            display: flex;
            align-items: flex-start;
            gap: 12px;
          }

          .check-ok {
            background: #d4edda;
            border-color: #28a745;
          }

          .check-error {
            background: #f8d7da;
            border-color: #dc3545;
          }

          .check-icon {
            font-size: 1.5rem;
            flex-shrink: 0;
          }

          .check-content {
            flex: 1;
          }

          .check-name {
            font-weight: 600;
            margin-bottom: 5px;
            text-transform: capitalize;
          }

          .check-message {
            font-size: 0.85rem;
            color: #666;
          }

          .check-error .check-message {
            color: #721c24;
            font-weight: 500;
          }

          .error-banner {
            background: #dc3545;
            color: white;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
            font-size: 1.1rem;
            font-weight: 500;
          }

          .error-details {
            margin-top: 10px;
            font-size: 0.9rem;
            opacity: 0.9;
          }

          .activity-indicator {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            background: #d4edda;
            border-radius: 20px;
            font-size: 0.9rem;
            font-weight: 600;
            color: #155724;
            margin-top: 10px;
          }

          .activity-indicator.active {
            background: #28a745;
            color: white;
            animation: pulse 2s infinite;
          }

          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
          }

          .bar-chart {
            display: flex;
            align-items: flex-end;
            gap: 4px;
            height: 100px;
            margin-top: 15px;
          }

          .bar {
            flex: 1;
            background: linear-gradient(to top, #667eea, #764ba2);
            border-radius: 4px 4px 0 0;
            min-height: 2px;
            position: relative;
            transition: all 0.3s;
          }

          .bar:hover {
            opacity: 0.8;
          }

          .bar-label {
            position: absolute;
            bottom: -20px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 0.7rem;
            color: #666;
            white-space: nowrap;
          }

          .bar-value {
            position: absolute;
            top: -20px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 0.7rem;
            font-weight: bold;
            color: #667eea;
          }

          .source-bar {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 12px;
          }

          .source-bar-label {
            min-width: 200px;
            font-weight: 500;
            font-size: 0.9rem;
          }

          .source-bar-track {
            flex: 1;
            height: 30px;
            background: #f0f0f0;
            border-radius: 15px;
            overflow: hidden;
            position: relative;
          }

          .source-bar-fill {
            height: 100%;
            background: linear-gradient(90deg, #667eea, #764ba2);
            display: flex;
            align-items: center;
            justify-content: flex-end;
            padding-right: 10px;
            color: white;
            font-weight: bold;
            font-size: 0.85rem;
            transition: width 0.5s ease;
          }

          .trend-indicator {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            font-size: 0.85rem;
            margin-top: 5px;
          }

          .trend-up {
            color: #28a745;
          }

          .trend-down {
            color: #dc3545;
          }

          .refresh-note {
            text-align: center;
            color: white;
            margin-top: 20px;
            font-size: 0.9rem;
          }

          .api-links {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
            margin-top: 20px;
          }

          .api-link {
            background: #f8f9fa;
            padding: 12px 20px;
            border-radius: 8px;
            text-decoration: none;
            color: #667eea;
            font-weight: 500;
            transition: all 0.2s;
          }

          .api-link:hover {
            background: #667eea;
            color: white;
          }

          @media (max-width: 768px) {
            h1 {
              font-size: 2rem;
            }

            .metric {
              font-size: 2rem;
            }
          }
        `}</style>
      </head>
      <body>
        <div className="container">
          <header>
            <h1>🏥 API Leads Monitor</h1>
            <p className="subtitle">Sistema de monitorización en tiempo real</p>
            <span className={`status-badge ${data.healthy ? 'status-healthy' : 'status-error'}`}>
              {data.healthy ? '✅ Sistema Operativo' : '❌ Sistema con Problemas'}
            </span>

            <div className="api-links">
              <a href="/api/health" className="api-link" target="_blank">📊 Health Check (JSON)</a>
              <a href="/api/metrics" className="api-link" target="_blank">📈 Métricas (JSON)</a>
              <a href="/" className="api-link" target="_blank">🏠 Home</a>
            </div>
          </header>

          {!data.healthy && data.error && (
            <div className="error-banner">
              ⚠️ Error crítico del sistema
              <div className="error-details">{data.error}</div>
            </div>
          )}

          {data.checks && Object.keys(data.checks).length > 0 && (
            <div className="card">
              <h2>🔍 Estado de los Componentes</h2>
              <div className="checks-grid">
                {Object.entries(data.checks).map(([name, check]) => (
                  <div
                    key={name}
                    className={`check-item ${check.status === 'ok' ? 'check-ok' : 'check-error'}`}
                  >
                    <div className="check-icon">
                      {check.status === 'ok' ? '✅' : '❌'}
                    </div>
                    <div className="check-content">
                      <div className="check-name">{name.replace(/_/g, ' ')}</div>
                      {check.message && (
                        <div className="check-message">{check.message}</div>
                      )}
                      {check.latency && (
                        <div className="check-message">Latencia: {check.latency}ms</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid">
            <div className="card">
              <h2>📈 Últimas 24 horas</h2>
              <div className="metric">{data.stats.total24h}</div>
              <div className="metric-label">Leads recibidos</div>
              {data.stats.last5min > 0 && (
                <div className="activity-indicator active">
                  ⚡ {data.stats.last5min} lead{data.stats.last5min !== 1 ? 's' : ''} en los últimos 5 min
                </div>
              )}
            </div>

            <div className="card">
              <h2>⚡ Promedio por hora</h2>
              <div className="metric">
                {(data.stats.total24h / 24).toFixed(1)}
              </div>
              <div className="metric-label">Leads/hora (24h)</div>
            </div>

            <div className="card">
              <h2>📊 Últimos 7 días</h2>
              <div className="metric">{data.stats.last7days}</div>
              <div className="metric-label">Total de leads</div>
              <div className="trend-indicator">
                📅 Promedio diario: <strong>{data.stats.dailyAvg}</strong> leads/día
              </div>
            </div>
          </div>

          <div className="grid">
            <div className="card">
              <h2>🎯 Ranking de Fuentes (24h)</h2>
              {Object.entries(data.stats.bySource).length > 0 ? (
                (() => {
                  const sortedSources = Object.entries(data.stats.bySource).sort(([, a], [, b]) => b - a);
                  const maxCount = Math.max(...sortedSources.map(([, count]) => count));
                  return sortedSources.map(([source, count]) => (
                    <div key={source} className="source-bar">
                      <div className="source-bar-label">{source}</div>
                      <div className="source-bar-track">
                        <div
                          className="source-bar-fill"
                          style={{ width: `${(count / maxCount) * 100}%` }}
                        >
                          {count}
                        </div>
                      </div>
                    </div>
                  ));
                })()
              ) : (
                <p style={{ color: '#666' }}>No hay datos de las últimas 24 horas</p>
              )}
            </div>

            <div className="card">
              <h2>📊 Distribución por Hora (24h)</h2>
              {Object.keys(data.stats.byHour).length > 0 ? (
                <div className="bar-chart">
                  {Array.from({ length: 24 }, (_, i) => {
                    const count = data.stats.byHour[i] || 0;
                    const maxCount = Math.max(...Object.values(data.stats.byHour));
                    const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
                    return (
                      <div
                        key={i}
                        className="bar"
                        style={{ height: `${height}%` }}
                        title={`${i}:00 - ${count} leads`}
                      >
                        {count > 0 && <span className="bar-value">{count}</span>}
                        <span className="bar-label">{i}h</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ color: '#666' }}>No hay datos de distribución horaria</p>
              )}
              <p style={{ marginTop: '30px', fontSize: '0.85rem', color: '#666', textAlign: 'center' }}>
                Distribución de leads por hora del día (últimas 24h)
              </p>
            </div>

            <div className="card" style={{ gridColumn: 'span 2' }}>
              <h2>📋 Últimos 10 Leads</h2>
              {data.recentLeads.length > 0 ? (
                <table className="leads-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Email</th>
                      <th>Teléfono</th>
                      <th>Origen</th>
                      <th>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentLeads.map((lead: any) => (
                      <tr key={lead.id}>
                        <td>{lead.name || '-'}</td>
                        <td>{lead.email || '-'}</td>
                        <td>{lead.phone || '-'}</td>
                        <td>{lead.source || 'unknown'}</td>
                        <td className="time-ago">
                          {new Date(lead.created_at).toLocaleString('es-ES')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: '#666' }}>No hay leads recientes</p>
              )}
            </div>
          </div>

          <p className="refresh-note">
            🔄 Esta página se actualiza automáticamente cada vez que la visitas
          </p>
        </div>
      </body>
    </html>
  );
}
