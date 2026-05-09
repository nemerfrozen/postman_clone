export type AiProvider = 'anthropic' | 'deepseek' | 'ollama'

export interface AiChatRequest {
  provider: AiProvider
  prompt: string
  system?: string
  model?: string
  maxTokens?: number
  temperature?: number
}

export interface AiChatResponse {
  provider: AiProvider
  model: string
  text: string
  raw: unknown
}

export interface AiModelInfo {
  id: string
  provider: AiProvider
}

export interface AiModelsResponse {
  models: AiModelInfo[]
  raw: unknown
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

async function callAnthropic(input: AiChatRequest): Promise<AiChatResponse> {
  const apiKey = getRequiredEnv('ANTHROPIC_API_KEY')
  const model = input.model || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest'

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: input.maxTokens ?? 1024,
      temperature: input.temperature ?? 0.2,
      system: input.system,
      messages: [{ role: 'user', content: input.prompt }],
    }),
  })

  const raw = await res.json()
  if (!res.ok) {
    throw new Error(`Anthropic error ${res.status}: ${JSON.stringify(raw)}`)
  }

  const text = Array.isArray((raw as { content?: unknown[] }).content)
    ? ((raw as { content: Array<{ type?: string; text?: string }> }).content
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text)
      .join('\n'))
    : ''

  return { provider: 'anthropic', model, text, raw }
}

async function callDeepseek(input: AiChatRequest): Promise<AiChatResponse> {
  const apiKey = getRequiredEnv('DEEPSEEK_API_KEY')
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
  const model = input.model || process.env.DEEPSEEK_MODEL || 'deepseek-chat'

  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxTokens ?? 1024,
      messages: [
        ...(input.system ? [{ role: 'system', content: input.system }] : []),
        { role: 'user', content: input.prompt },
      ],
    }),
  })

  const raw = await res.json()
  if (!res.ok) {
    throw new Error(`DeepSeek error ${res.status}: ${JSON.stringify(raw)}`)
  }

  const text =
    ((raw as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content as string | undefined) || ''

  return { provider: 'deepseek', model, text, raw }
}

async function callOllama(input: AiChatRequest): Promise<AiChatResponse> {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
  const model = input.model || process.env.OLLAMA_MODEL || 'llama3.1'

  const prompt = [input.system, input.prompt].filter(Boolean).join('\n\n')
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        temperature: input.temperature ?? 0.2,
      },
    }),
  })

  const raw = await res.json()
  if (!res.ok) {
    throw new Error(`Ollama error ${res.status}: ${JSON.stringify(raw)}`)
  }

  const text = ((raw as { response?: string }).response || '').trim()
  return { provider: 'ollama', model, text, raw }
}

export async function callAiChat(input: AiChatRequest): Promise<AiChatResponse> {
  if (!input.prompt?.trim()) throw new Error('prompt is required')

  if (input.provider === 'anthropic') return callAnthropic(input)
  if (input.provider === 'deepseek') return callDeepseek(input)
  if (input.provider === 'ollama') return callOllama(input)

  throw new Error('Unsupported provider')
}

async function listAnthropicModels(): Promise<AiModelsResponse> {
  const apiKey = getRequiredEnv('ANTHROPIC_API_KEY')
  const res = await fetch('https://api.anthropic.com/v1/models', {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  })
  const raw = await res.json()
  if (!res.ok) throw new Error(`Anthropic models error ${res.status}: ${JSON.stringify(raw)}`)

  const models = ((raw as { data?: Array<{ id?: string }> }).data || [])
    .map((m) => m.id)
    .filter((id): id is string => Boolean(id))
    .map((id) => ({ id, provider: 'anthropic' as const }))

  return { models, raw }
}

async function listDeepseekModels(): Promise<AiModelsResponse> {
  const apiKey = getRequiredEnv('DEEPSEEK_API_KEY')
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/models`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
  })
  const raw = await res.json()
  if (!res.ok) throw new Error(`DeepSeek models error ${res.status}: ${JSON.stringify(raw)}`)

  const models = ((raw as { data?: Array<{ id?: string }> }).data || [])
    .map((m) => m.id)
    .filter((id): id is string => Boolean(id))
    .map((id) => ({ id, provider: 'deepseek' as const }))

  return { models, raw }
}

async function listOllamaModels(): Promise<AiModelsResponse> {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/tags`, {
    method: 'GET',
    headers: { 'content-type': 'application/json' },
  })
  const raw = await res.json()
  if (!res.ok) throw new Error(`Ollama models error ${res.status}: ${JSON.stringify(raw)}`)

  const models = ((raw as { models?: Array<{ name?: string }> }).models || [])
    .map((m) => m.name)
    .filter((id): id is string => Boolean(id))
    .map((id) => ({ id, provider: 'ollama' as const }))

  return { models, raw }
}

export async function listAiModels(provider?: AiProvider): Promise<AiModelsResponse> {
  if (provider === 'anthropic') return listAnthropicModels()
  if (provider === 'deepseek') return listDeepseekModels()
  if (provider === 'ollama') return listOllamaModels()

  const [anthropic, deepseek, ollama] = await Promise.all([listAnthropicModels(), listDeepseekModels(), listOllamaModels()])
  return {
    models: [...anthropic.models, ...deepseek.models, ...ollama.models],
    raw: {
      anthropic: anthropic.raw,
      deepseek: deepseek.raw,
      ollama: ollama.raw,
    },
  }
}
