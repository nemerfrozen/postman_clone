import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { method, url, headers, body, bodyType } = await req.json()

    const fetchHeaders: Record<string, string> = {}
    if (headers) {
      const parsed = JSON.parse(headers)
      for (const h of parsed) {
        if (h.key && h.value) fetchHeaders[h.key] = h.value
      }
    }

    const fetchOptions: RequestInit = {
      method: method || 'GET',
      headers: fetchHeaders,
    }

    if (bodyType === 'raw' && body && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = body
    }

    const response = await fetch(url, fetchOptions)
    let responseBody: unknown = null
    try {
      responseBody = await response.json()
    } catch {
      responseBody = { error: 'La respuesta del servidor no es JSON válido' }
    }
    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => { responseHeaders[key] = value })

    return NextResponse.json({
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
    })
  } catch (error) {
    return NextResponse.json({
      status: 0,
      statusText: 'Error',
      headers: {},
      body: { error: String(error) },
    })
  }
}
