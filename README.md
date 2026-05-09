# Postman Clone

Cliente API web construido con Next.js + Prisma (Supabase PostgreSQL), con interfaz estilo Postman para:

- Organizar solicitudes por proyectos
- Definir environments por proyecto (`baseUrl` y `token`)
- Ejecutar solicitudes HTTP
- Ver respuestas JSON formateadas con resaltado de sintaxis
- Ejecutar tests rápidos sobre la respuesta
- Ejecutar pruebas en lote (`Run All Tests`)

## Stack

- Next.js (App Router)
- React
- Prisma
- Supabase PostgreSQL

## Requisitos

- Node.js 20+
- npm

## Instalación

```bash
npm install
```

## Configuración de base de datos

Sincronizar esquema y generar cliente Prisma:

```bash
npx prisma db push
npx prisma generate
```

## Ejecutar en desarrollo

```bash
npm run dev
```

App local:

- `http://localhost:3000`

## Autenticación

La aplicación requiere login.

Credenciales:

- No publiques usuarios/contraseñas reales en documentación.
- Configura credenciales seguras por entorno (desarrollo, QA, producción).

Notas:

- El login valida contra la tabla `AppUser` en Supabase PostgreSQL.
- Se usa cookie de sesión `pc_session`.
- Las rutas están protegidas por `middleware`.

## Uso funcional

### 1. Proyectos y solicitudes

- Crea proyectos desde el panel lateral.
- Cada proyecto contiene solicitudes (`requests`).
- Puedes importar colecciones JSON de Postman.

### 2. Environments por proyecto

Campos disponibles en la parte superior:

- `Base URL`
- `Token`

Comportamiento:

- Se guardan en BD por proyecto.
- También se guardan en `localStorage` por proyecto activo.
- No se pierden al cambiar de request dentro del mismo proyecto.

Variables soportadas:

- `{{baseUrl}}`
- `{{token}}`

Se reemplazan en:

- URL
- Headers
- Body (raw)

### 3. Header Authorization automático

Si `token` tiene valor, se agrega automáticamente:

- `Authorization: Bearer <token>`

Solo se agrega si no existe ya un header `Authorization` en la request.

### 4. Panel inferior (30/70)

Distribución vertical:

- Parte superior (`30%`): edición `Headers` / `Body`
- Parte inferior (`70%`): panel de resultados

Pestañas del panel de resultados:

- `Response`: body JSON formateado y con colores
- `Headers`: headers de respuesta
- `Request`: snapshot de la petición completa enviada
- `Test`: editor para validar la respuesta recibida

### 5. Tests de respuesta

En pestaña `Test`, el script tiene acceso a:

- `response.status`
- `response.headers`
- `response.body`

Debe retornar `true` para marcar el test como OK.

Ejemplo:

```js
return response.status >= 200 && response.status < 300
```

### 6. Run All Tests

Ejecuta todas las solicitudes de todos los proyectos y muestra:

- Estado por request
- Duración
- Resumen de éxito/fallo

## Formato de respuesta

La app trata la respuesta como JSON y la formatea en pantalla.

Si el backend remoto no retorna JSON válido, se muestra un JSON de error controlado:

```json
{ "error": "La respuesta del servidor no es JSON válido" }
```

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Servicio IA (Anthropic / DeepSeek)

Endpoint interno:

- `POST /api/ai/chat`
- `GET /api/ai/models?provider=anthropic|deepseek|ollama`

Body:

```json
{
  "provider": "anthropic",
  "prompt": "Resume este texto...",
  "system": "Responde en español",
  "model": "claude-3-5-sonnet-latest",
  "maxTokens": 512,
  "temperature": 0.2
}
```

`provider` soportados:

- `anthropic`
- `deepseek`
- `ollama`

Listar modelos:

- `GET /api/ai/models?provider=anthropic`
- `GET /api/ai/models?provider=deepseek`
- `GET /api/ai/models?provider=ollama`
- `GET /api/ai/models` (ambos)

Variables de entorno:

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL` (opcional)
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL` (opcional, default `https://api.deepseek.com`)
- `DEEPSEEK_MODEL` (opcional, default `deepseek-chat`)
- `OLLAMA_BASE_URL` (opcional, default `http://localhost:11434`)
- `OLLAMA_MODEL` (opcional, default `llama3.1`)

Buenas prácticas de seguridad:

- Nunca subas `.env` al repositorio.
- No compartas API keys en README, issues, PRs o logs.
- Usa placeholders en ejemplos y variables de entorno en tiempo de ejecución.

## Estructura principal

- `src/app/page.tsx`: UI principal (editor, envío, response, tests)
- `src/app/login/page.tsx`: login
- `src/app/api/proxy/route.ts`: proxy HTTP hacia APIs externas
- `src/app/api/projects/*`: CRUD de proyectos/environments
- `src/app/api/requests/*`: CRUD de requests
- `src/app/api/import/route.ts`: importación de colección Postman
- `src/app/api/login/route.ts`: autenticación
- `src/app/api/logout/route.ts`: cierre de sesión
- `src/middleware.ts`: protección de rutas por cookie
- `prisma/schema.prisma`: modelo de datos

## Notas

- `npm run lint` puede reportar advertencias/errores existentes en hooks de `page.tsx` (reglas React hooks), independientes del flujo funcional principal.
