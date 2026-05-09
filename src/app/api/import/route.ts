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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (!body || !body.info || !body.item) {
      return NextResponse.json({ error: 'Formato de colección Postman inválido' }, { status: 400 })
    }

    const collection = body as PostmanCollection
    const requests = flattenItems(collection.item, '')

    if (requests.length === 0) {
      return NextResponse.json({ error: 'La colección no contiene solicitudes' }, { status: 400 })
    }

    const project = await prisma.project.create({
      data: {
        name: collection.info.name || 'Colección importada',
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
