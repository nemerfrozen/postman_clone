import { NextRequest, NextResponse } from 'next/server'
import { callAiChat, type AiProvider } from '@/lib/ai/service'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const provider = body?.provider as AiProvider
    const prompt = typeof body?.prompt === 'string' ? body.prompt : ''
    const system = typeof body?.system === 'string' ? body.system : undefined
    const model = typeof body?.model === 'string' ? body.model : undefined
    const maxTokens = typeof body?.maxTokens === 'number' ? body.maxTokens : undefined
    const temperature = typeof body?.temperature === 'number' ? body.temperature : undefined

    const result = await callAiChat({
      provider,
      prompt,
      system,
      model,
      maxTokens,
      temperature,
    })

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
