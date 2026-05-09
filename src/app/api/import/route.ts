import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface PostmanHeader {
  key: string
  value: string
}

interface PostmanUrl {
  raw?: string
  host?: string[]
  path?: string[]
  protocol?: string
}

interface PostmanBody {
  mode: string
  raw?: string
}

interface PostmanRequest {
  method: string
  header?: PostmanHeader[]
  url?: string | PostmanUrl
  body?: PostmanBody
}

interface PostmanItem {
  name: string
  request?: PostmanRequest
  item?: PostmanItem[]
}

interface PostmanCollection {
  info: {
    name: string
    schema?: string
  }
  item: PostmanItem[]
}

interface OpenApiDoc {
  openapi?: string
  swagger?: string
  info?: { title?: string }
  servers?: Array<{ url?: string }>
  paths?: Record<string, Record<string, { summary?: string; operationId?: string }>>
}

function extractUrl(url: string | PostmanUrl | undefined): string {
  if (!url) return ''
  if (typeof url === 'string') return url
  if (url.raw) return url.raw
  const parts: string[] = []
  if (url.protocol) parts.push(url.protocol)
  else parts.push('https')
  parts.push('://')
  if (url.host) parts.push(url.host.join('.'))
  if (url.path) parts.push('/' + url.path.join('/'))
  return parts.join('') || ''
}

function extractHeaders(headers: PostmanHeader[] | undefined): string {
  if (!headers || headers.length === 0) return '[]'
  const filtered = headers
    .filter(h => h.key)
    .map(h => ({ key: h.key, value: h.value || '' }))
  return JSON.stringify(filtered)
}

function flattenItems(items: PostmanItem[], parentName: string): {
  name: string
  method: string
  url: string
  headers: string
  bodyType: string
  bodyContent: string
}[] {
  const result: ReturnType<typeof flattenItems> = []

  for (const item of items) {
    const fullName = parentName ? `${parentName} / ${item.name}` : item.name

    if (item.request) {
      result.push({
        name: fullName,
        method: item.request.method || 'GET',
        url: extractUrl(item.request.url),
        headers: extractHeaders(item.request.header),
        bodyType: item.request.body?.mode === 'raw' ? 'raw' : 'none',
        bodyContent: item.request.body?.raw || '',
      })
    }

    if (item.item && item.item.length > 0) {
      result.push(...flattenItems(item.item, fullName))
    }
  }

  return result
}

function parseOpenApi(doc: OpenApiDoc): {
  projectName: string
  baseUrl: string
  requests: {
    name: string
    method: string
    url: string
    headers: string
    bodyType: string
    bodyContent: string
  }[]
} {
  const requests: {
    name: string
    method: string
    url: string
    headers: string
    bodyType: string
    bodyContent: string
  }[] = []

  const paths = doc.paths || {}
  for (const [path, ops] of Object.entries(paths)) {
    for (const [methodRaw, op] of Object.entries(ops || {})) {
      const method = methodRaw.toUpperCase()
      const name = op?.summary || op?.operationId || `${method} ${path}`
      requests.push({
        name,
        method,
        url: path,
        headers: '[]',
        bodyType: 'none',
        bodyContent: '',
      })
    }
  }

  return {
    projectName: doc.info?.title?.trim() || 'OpenAPI importado',
    baseUrl: doc.servers?.[0]?.url?.trim() || '',
    requests,
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const payload = body?.collection ? body.collection : body
    const projectNameInput = typeof body?.projectName === 'string' ? body.projectName.trim() : ''
    let requests: {
      name: string
      method: string
      url: string
      headers: string
      bodyType: string
      bodyContent: string
    }[] = []
    let resolvedProjectName = 'Colección importada'
    let resolvedBaseUrl = ''

    const isPostman = Boolean(payload?.info && payload?.item)
    const isOpenApi = Boolean(payload?.openapi || payload?.swagger) && Boolean(payload?.paths)

    if (isPostman) {
      const collection = payload as PostmanCollection
      requests = flattenItems(collection.item, '')
      resolvedProjectName = collection.info.name || 'Colección importada'
    } else if (isOpenApi) {
      const openApi = parseOpenApi(payload as OpenApiDoc)
      requests = openApi.requests
      resolvedProjectName = openApi.projectName
      resolvedBaseUrl = openApi.baseUrl
    } else {
      return NextResponse.json({ error: 'Formato inválido: se admite Postman Collection u OpenAPI' }, { status: 400 })
    }

    if (requests.length === 0) {
      return NextResponse.json({ error: 'El archivo no contiene solicitudes importables' }, { status: 400 })
    }

    const project = await prisma.project.create({
      data: {
        name: projectNameInput || resolvedProjectName,
        baseUrl: resolvedBaseUrl,
        requests: {
          create: requests.map(r => ({
            name: r.name,
            method: r.method,
            url: r.url,
            headers: r.headers,
            bodyType: r.bodyType,
            bodyContent: r.bodyContent,
          })),
        },
      },
      include: { requests: true },
    })

    return NextResponse.json(project, { status: 201 })
  } catch (e) {
    console.error('Import error:', e)
    return NextResponse.json({ error: 'Error al procesar el archivo' }, { status: 500 })
  }
}
