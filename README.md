# API Leads Orchestrator

Orquestador de leads con seguridad multi-capa (CORS + HMAC + API Keys + Rate Limiting).

## Características

- ✅ Webhook endpoint seguro para recibir leads
- ✅ Validación con Zod
- ✅ CORS restrictivo por dominio
- ✅ HMAC SHA-256 signatures
- ✅ API Keys rotables
- ✅ Rate limiting por IP
- ✅ Timestamp verification (ventana de 5 minutos)
- ✅ Guardado automático en Supabase
- ✅ Tracking de source y metadata (UTMs, IP, user agent)
- ✅ TypeScript + Next.js 15

## Seguridad Multi-Capa

### 1. CORS
Solo acepta requests desde dominios en la whitelist (`ALLOWED_ORIGINS`).

### 2. API Key
Header `X-API-Key` debe coincidir con alguna key en `API_KEYS`.

### 3. HMAC Signature
El cliente firma el payload con `WEBHOOK_SECRET`:
```
signature = HMAC-SHA256(payload, secret)
```

### 4. Timestamp
Header `X-Timestamp` debe ser reciente (< 5 minutos) para prevenir replay attacks.

### 5. Rate Limiting
Máximo 20 requests por minuto por IP.

## Deploy en Vercel

```bash
vercel --prod
```

Luego añadir dominio en Vercel Dashboard:
- Settings → Domains → Add: `api-leads.inmopilot.es`
