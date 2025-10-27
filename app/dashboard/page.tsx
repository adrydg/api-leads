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

    // Get stats by source
    const bySource: Record<string, number> = {};
    last24h?.forEach(lead => {
      const source = lead.source || 'unknown';
      bySource[source] = (bySource[source] || 0) + 1;
    });

    const hasErrors = Object.values(checks).some(c => c.status === 'error');

    return {
      healthy: !hasErrors,
      checks,
      recentLeads: recentLeads || [],
      stats: {
        total24h: last24h?.length || 0,
        bySource,
      },
    };
  } catch (error) {
    checks.system = { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };

    return {
      healthy: false,
      checks,
      recentLeads: [],
      stats: { total24h: 0, bySource: {} },
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
            </div>

            <div className="card">
              <h2>⚡ Promedio por hora</h2>
              <div className="metric">
                {(data.stats.total24h / 24).toFixed(1)}
              </div>
              <div className="metric-label">Leads/hora</div>
            </div>

            <div className="card">
              <h2>🎯 Fuentes Activas</h2>
              <div className="metric">{Object.keys(data.stats.bySource).length}</div>
              <div className="metric-label">Orígenes diferentes</div>
            </div>
          </div>

          <div className="grid">
            <div className="card">
              <h2>🎯 Leads por Origen</h2>
              {Object.entries(data.stats.bySource).length > 0 ? (
                Object.entries(data.stats.bySource)
                  .sort(([, a], [, b]) => b - a)
                  .map(([source, count]) => (
                    <div key={source} className="source-item">
                      <span className="source-name">{source}</span>
                      <span className="source-count">{count}</span>
                    </div>
                  ))
              ) : (
                <p style={{ color: '#666' }}>No hay datos de las últimas 24 horas</p>
              )}
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
