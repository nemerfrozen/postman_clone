import { NextRequest, NextResponse } from 'next/server'
import { listAiModels, type AiProvider } from '@/lib/ai/service'

export async function GET(req: NextRequest) {
  try {
    const provider = req.nextUrl.searchParams.get('provider') as AiProvider | null
    const result = await listAiModels(provider || undefined)
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
