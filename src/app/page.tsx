'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AI_DIRECT_RAW_PROMPT, AI_PROMPT_PLACEHOLDER_BODY, AI_SYSTEM_PROMPT_STRICT_JSON } from '@/lib/ai/prompts'

interface Header {
  key: string
  value: string
}

interface StoredRequest {
  id: string
  name: string
  method: string
  url: string
  headers: string
  bodyType: string
  bodyContent: string
  projectId: string
}

interface Project {
  id: string
  name: string
  baseUrl: string
  token: string
  requests: StoredRequest[]
}

interface ProxyResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: unknown
}

interface SentRequestSnapshot {
  method: string
  url: string
  headers: Header[]
  bodyType: string
  body?: string
}

interface TestResult {
  requestName: string
  projectName: string
  method: string
  url: string
  status: number
  statusText: string
  body: string
  duration: number
  error: boolean
}

interface AiChatMessage {
  role: 'user' | 'assistant'
  text: string
}

interface AiModelOption {
  id: string
  provider: 'anthropic' | 'deepseek' | 'ollama'
}

interface ResponseLineTest {
  id: string
  name: string
  expression: string
  pass?: boolean
  message?: string
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const ENV_STORAGE_PREFIX = 'postman-clone-env:'
const AI_CONFIG_STORAGE_KEY = 'postman-clone-ai-config'
const STANDARD_HEADER_KEYS = [
  'Accept',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'Connection',
  'Content-Type',
  'Cookie',
  'Host',
  'Origin',
  'Pragma',
  'Referer',
  'User-Agent',
  'X-API-Key',
  'X-Requested-With',
]
const STANDARD_HEADER_VALUES = [
  'application/json',
  'application/xml',
  'text/plain',
  'multipart/form-data',
  'application/x-www-form-urlencoded',
  'Bearer {{token}}',
  'Basic ',
  'no-cache',
  'keep-alive',
  'gzip, deflate, br',
  '*/*',
]
const JSON_TOKEN_REGEX = /"(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(?=\s*:)?|"(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b|[{}[\],:]/g

const getJsonTokenClassName = (token: string) => {
  if (token.startsWith('"')) {
    if (token.endsWith(':')) return 'json-key'
    return 'json-string'
  }
  if (/^-?\d/.test(token)) return 'json-number'
  if (token === 'true' || token === 'false') return 'json-boolean'
  if (token === 'null') return 'json-null'
  return 'json-punctuation'
}

const renderJsonSyntax = (value: unknown): ReactNode[] => {
  const jsonText = JSON.stringify(value, null, 2)
  const nodes: ReactNode[] = []
  let lastIndex = 0

  for (const match of jsonText.matchAll(JSON_TOKEN_REGEX)) {
    const token = match[0]
    const index = match.index ?? 0
    if (index > lastIndex) nodes.push(jsonText.slice(lastIndex, index))
    nodes.push(
      <span key={`${index}-${token}`} className={getJsonTokenClassName(token)}>
        {token}
      </span>
    )
    lastIndex = index + token.length
  }

  if (lastIndex < jsonText.length) nodes.push(jsonText.slice(lastIndex))
  return nodes
}

const toSearchText = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '')

const formatJsonString = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return value
  }
}

const isValidJsonString = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return false
  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null)
  const [method, setMethod] = useState('GET')
  const [url, setUrl] = useState('')
  const [headers, setHeaders] = useState<Header[]>([{ key: '', value: '' }])
  const [bodyType, setBodyType] = useState('none')
  const [bodyContent, setBodyContent] = useState('')
  const [requestName, setRequestName] = useState('Nueva solicitud')
  const [response, setResponse] = useState<ProxyResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [resTab, setResTab] = useState<'body' | 'headers' | 'request' | 'test'>('body')
  const [tab, setTab] = useState<'params' | 'headers' | 'body'>('headers')
  const [showNewProject, setShowNewProject] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showEnvModal, setShowEnvModal] = useState(false)
  const [showAiConfigModal, setShowAiConfigModal] = useState(false)
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({})
  const [sidebarSearch, setSidebarSearch] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [importProjectName, setImportProjectName] = useState('')
  const [pendingImportCollection, setPendingImportCollection] = useState<unknown | null>(null)
  const [baseUrl, setBaseUrl] = useState('')
  const [token, setToken] = useState('')
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [testResults, setTestResults] = useState<TestResult[] | null>(null)
  const [runningTests, setRunningTests] = useState(false)
  const [lastRequest, setLastRequest] = useState<SentRequestSnapshot | null>(null)
  const [responseLineTests, setResponseLineTests] = useState<ResponseLineTest[]>([
    { id: 'test-status-2xx', name: 'Status 2xx', expression: 'response.status >= 200 && response.status < 300' },
  ])
  const [responseTestsSummary, setResponseTestsSummary] = useState<{ passed: number; total: number } | null>(null)
  const [saveMessage, setSaveMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [aiProvider, setAiProvider] = useState<'anthropic' | 'deepseek' | 'ollama'>('deepseek')
  const [aiModel, setAiModel] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiMessages, setAiMessages] = useState<AiChatMessage[]>([])
  const [aiModelOptions, setAiModelOptions] = useState<AiModelOption[]>([])
  const [aiModelsLoading, setAiModelsLoading] = useState(false)
  const [aiModelsError, setAiModelsError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      setProjects(data)
      return data
    } catch {
      return []
    }
  }, [])

  const getEnvStorageKey = (projectId: string) => `${ENV_STORAGE_PREFIX}${projectId}`

  useEffect(() => {
    loadProjects().then((data) => {
      setLoadingProjects(false)
      if (data.length > 0) {
        setActiveProjectId(data[0].id)
        if (data[0].requests.length > 0) {
          selectRequest(data[0].requests[0])
        }
      }
    })
  }, [loadProjects])

  useEffect(() => {
    if (activeProjectId) {
      const p = projects.find(pr => pr.id === activeProjectId)
      if (p) {
        const savedEnvRaw = localStorage.getItem(getEnvStorageKey(activeProjectId))
        if (savedEnvRaw) {
          try {
            const savedEnv = JSON.parse(savedEnvRaw) as { baseUrl?: string; token?: string }
            setBaseUrl(savedEnv.baseUrl ?? p.baseUrl ?? '')
            setToken(savedEnv.token ?? p.token ?? '')
            return
          } catch {
            // ignore invalid localStorage payload
          }
        }
        setBaseUrl(p.baseUrl || '')
        setToken(p.token || '')
      }
    }
  }, [activeProjectId, projects])

  useEffect(() => {
    if (!activeProjectId) return
    localStorage.setItem(
      getEnvStorageKey(activeProjectId),
      JSON.stringify({ baseUrl, token })
    )
  }, [activeProjectId, baseUrl, token])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(AI_CONFIG_STORAGE_KEY)
      if (!saved) return
      const parsed = JSON.parse(saved) as { provider?: 'anthropic' | 'deepseek' | 'ollama'; model?: string }
      if (parsed.provider === 'anthropic' || parsed.provider === 'deepseek' || parsed.provider === 'ollama') {
        setAiProvider(parsed.provider)
      }
      if (typeof parsed.model === 'string') {
        setAiModel(parsed.model)
      }
    } catch {
      // ignore invalid localStorage payload
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(
      AI_CONFIG_STORAGE_KEY,
      JSON.stringify({ provider: aiProvider, model: aiModel })
    )
  }, [aiProvider, aiModel])

  const selectRequest = (req: StoredRequest) => {
    setActiveRequestId(req.id)
    setMethod(req.method)
    setUrl(req.url)
    setRequestName(req.name)
    setBodyType(req.bodyType)
    setBodyContent(formatJsonString(req.bodyContent))
    try {
      setHeaders(JSON.parse(req.headers))
    } catch {
      setHeaders([{ key: '', value: '' }])
    }
    setResponse(null)
    void loadTestsForRequest(req.id, req.url)
  }

  const loadTestsForRequest = async (requestId: string, requestUrl: string) => {
    const trimmedUrl = (requestUrl || '').trim()
    if (!trimmedUrl) {
      setResponseLineTests([
        { id: `test-default-${requestId}`, name: 'Status 2xx', expression: 'response.status >= 200 && response.status < 300' },
      ])
      setResponseTestsSummary(null)
      return
    }

    try {
      const res = await fetch(`/api/tests?url=${encodeURIComponent(trimmedUrl)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'No fue posible cargar tests')

      const tests = Array.isArray(data?.tests) ? data.tests : []
      if (tests.length === 0) {
        setResponseLineTests([
          { id: `test-default-${requestId}`, name: 'Status 2xx', expression: 'response.status >= 200 && response.status < 300' },
        ])
      } else {
        setResponseLineTests(
          tests.map((t: { id?: string; name?: string; expression?: string }, idx: number) => ({
            id: t.id || `test-${requestId}-${idx}`,
            name: t.name || `Test ${idx + 1}`,
            expression: t.expression || 'response.status >= 200 && response.status < 300',
          }))
        )
      }
      setResponseTestsSummary(null)
    } catch {
      setResponseLineTests([
        { id: `test-default-${requestId}`, name: 'Status 2xx', expression: 'response.status >= 200 && response.status < 300' },
      ])
      setResponseTestsSummary(null)
    }
  }

  const handleSave = async () => {
    if (!activeRequestId) return
    const cleanedHeaders = headers.filter(h => h.key || h.value)
    const payload = {
      name: requestName,
      method,
      url,
      headers: JSON.stringify(cleanedHeaders),
      bodyType,
      bodyContent,
    }
    try {
      const res = await fetch(`/api/requests/${activeRequestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('No fue posible guardar la solicitud')
      await fetch('/api/tests', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: activeRequestId,
          url,
          tests: responseLineTests.map(t => ({ name: t.name, expression: t.expression })),
        }),
      })
      await loadProjects()
      setSaveMessage({ type: 'ok', text: 'Solicitud guardada' })
      setTimeout(() => setSaveMessage(null), 2000)
    } catch {
      setSaveMessage({ type: 'error', text: 'Error al guardar la solicitud' })
      setTimeout(() => setSaveMessage(null), 2500)
    }
  }

  const handleSaveEnvironments = async () => {
    if (!activeProjectId) return
    try {
      const res = await fetch(`/api/projects/${activeProjectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, token }),
      })
      if (!res.ok) throw new Error('No fue posible guardar environments')
      await loadProjects()
      setSaveMessage({ type: 'ok', text: 'Environments guardados' })
      setTimeout(() => setSaveMessage(null), 2000)
    } catch {
      setSaveMessage({ type: 'error', text: 'Error al guardar environments' })
      setTimeout(() => setSaveMessage(null), 2500)
    }
  }

  const applyEnvironments = (value: string, currentBaseUrl: string, currentToken: string) =>
    value
      .replace(/\{\{\s*baseUrl\s*\}\}/gi, currentBaseUrl.trim())
      .replace(/\{\{\s*token\s*\}\}/gi, currentToken.trim())

  const resolveUrl = (reqUrl: string, currentBaseUrl: string, currentToken: string) => {
    const base = currentBaseUrl.trim()
    const withBasePlaceholder = applyEnvironments(reqUrl, currentBaseUrl, currentToken)
    const trimmed = withBasePlaceholder.trim()
    if (!trimmed) return ''
    if (/^https?:\/\//i.test(trimmed)) return trimmed
    if (!base) return trimmed
    return base.replace(/\/+$/, '') + '/' + trimmed.replace(/^\/+/, '')
  }

  const handleSend = async () => {
    setLoading(true)
    setResponse(null)
    setResponseTestsSummary(null)
    setResponseLineTests(prev => prev.map(t => ({ ...t, pass: undefined, message: undefined })))
    const fullUrl = resolveUrl(url, baseUrl, token)
    try {
      const cleanedHeaders = headers
        .filter(h => h.key && h.value)
        .map(h => ({
          key: applyEnvironments(h.key, baseUrl, token),
          value: applyEnvironments(h.value, baseUrl, token),
        }))
      if (token.trim() && !cleanedHeaders.some(h => h.key.toLowerCase() === 'authorization')) {
        cleanedHeaders.push({
          key: 'Authorization',
          value: `Bearer ${token.trim()}`,
        })
      }
      if (bodyType === 'raw' && !cleanedHeaders.some(h => h.key.toLowerCase() === 'content-type')) {
        cleanedHeaders.push({
          key: 'Content-Type',
          value: 'application/json',
        })
      }
      const requestBody = bodyType === 'raw' ? applyEnvironments(bodyContent, baseUrl, token) : undefined
      setLastRequest({
        method,
        url: fullUrl,
        headers: cleanedHeaders,
        bodyType,
        body: requestBody,
      })
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method,
          url: fullUrl,
          headers: JSON.stringify(cleanedHeaders),
          body: requestBody,
          bodyType,
        }),
      })
      const data = await res.json()
      setResponse(data)
    } catch {
      setResponse({ status: 0, statusText: 'Error', headers: {}, body: { error: 'Error de conexión' } })
    }
    setLoading(false)
  }

  const runAllTests = async () => {
    setRunningTests(true)
    setTestResults(null)
    setResTab('body')
    const results: TestResult[] = []

    const allRequests: { req: StoredRequest; projectName: string; projectBaseUrl: string; projectToken: string }[] = []
    for (const p of projects) {
      for (const r of p.requests) {
        allRequests.push({ req: r, projectName: p.name, projectBaseUrl: p.baseUrl || '', projectToken: p.token || '' })
      }
    }

    for (const { req, projectName, projectBaseUrl, projectToken } of allRequests) {
      const start = performance.now()
      const reqUrl = resolveUrl(req.url, projectBaseUrl, projectToken)
      try {
        let parsedHeaders = '[]'
        try {
          const parsed = JSON.parse(req.headers) as Header[]
          const resolvedHeaders = parsed.map(h => ({
            key: applyEnvironments(h.key || '', projectBaseUrl, projectToken),
            value: applyEnvironments(h.value || '', projectBaseUrl, projectToken),
          }))
          if (projectToken.trim() && !resolvedHeaders.some(h => h.key.toLowerCase() === 'authorization')) {
            resolvedHeaders.push({
              key: 'Authorization',
              value: `Bearer ${projectToken.trim()}`,
            })
          }
          if (req.bodyType === 'raw' && !resolvedHeaders.some(h => h.key.toLowerCase() === 'content-type')) {
            resolvedHeaders.push({
              key: 'Content-Type',
              value: 'application/json',
            })
          }
          parsedHeaders = JSON.stringify(resolvedHeaders)
        } catch {
          parsedHeaders = projectToken.trim()
            ? JSON.stringify([{ key: 'Authorization', value: `Bearer ${projectToken.trim()}` }])
            : '[]'
        }
        const res = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: req.method,
            url: reqUrl,
            headers: parsedHeaders,
            body: req.bodyType === 'raw' ? applyEnvironments(req.bodyContent, projectBaseUrl, projectToken) : undefined,
            bodyType: req.bodyType,
          }),
        })
        const data = await res.json()
        const duration = Math.round(performance.now() - start)
        results.push({
          requestName: req.name,
          projectName,
          method: req.method,
          url: req.url,
          status: data.status,
          statusText: data.statusText,
          body: JSON.stringify(data.body, null, 2).slice(0, 500),
          duration,
          error: false,
        })
      } catch {
        const duration = Math.round(performance.now() - start)
        results.push({
          requestName: req.name,
          projectName,
          method: req.method,
          url: req.url,
          status: 0,
          statusText: 'Error',
          body: JSON.stringify({ error: 'Error de conexión' }),
          duration,
          error: true,
        })
      }
    }

    setTestResults(results)
    setRunningTests(false)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const suggestedName = typeof json?.info?.name === 'string' && json.info.name.trim()
        ? json.info.name.trim()
        : 'Colección importada'
      setPendingImportCollection(json)
      setImportProjectName(suggestedName)
      setShowImportDialog(true)
    } catch {
      setResponse({ status: 400, statusText: 'Error', headers: {}, body: { error: 'Archivo JSON inválido' } })
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const confirmImportCollection = async () => {
    if (!pendingImportCollection) return
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: importProjectName.trim(),
          collection: pendingImportCollection,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        await loadProjects()
        setActiveProjectId(data.id)
        if (data.requests?.length > 0) {
          selectRequest(data.requests[0])
        }
      } else {
        setResponse({ status: 400, statusText: 'Error', headers: {}, body: { error: data.error || 'Error al importar' } })
      }
    } catch {
      setResponse({ status: 500, statusText: 'Error', headers: {}, body: { error: 'Error al importar' } })
    }
    setPendingImportCollection(null)
    setShowImportDialog(false)
    setImportProjectName('')
  }

  const createProject = async () => {
    if (!newProjectName.trim()) return
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newProjectName }),
    })
    const project = await res.json()
    setNewProjectName('')
    setShowNewProject(false)
    await loadProjects()
    setActiveProjectId(project.id)
    selectRequest(project.requests[0])
  }

  const addRequest = async (projectId: string) => {
    const res = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Nueva solicitud', projectId }),
    })
    const req = await res.json()
    await loadProjects()
    selectRequest(req)
  }

  const deleteProject = async (id: string) => {
    await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    await loadProjects()
    setActiveProjectId(null)
    setActiveRequestId(null)
  }

  const deleteRequest = async (id: string) => {
    await fetch(`/api/requests/${id}`, { method: 'DELETE' })
    await loadProjects()
    if (activeRequestId === id) {
      setActiveRequestId(null)
      setMethod('GET')
      setUrl('')
      setRequestName('Nueva solicitud')
      setHeaders([{ key: '', value: '' }])
      setBodyType('none')
      setBodyContent('')
      setResponse(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      handleSave()
    }
  }

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  const runSingleResponseTest = (testId: string) => {
    if (!response) return
    setResponseLineTests(prev =>
      prev.map(t => {
        if (t.id !== testId) return t
        try {
          // eslint-disable-next-line no-new-func
          const fn = new Function('response', `return (${t.expression})`)
          const result = fn(response)
          return {
            ...t,
            pass: result === true,
            message: result === true ? 'OK' : `Falló: ${JSON.stringify(result)}`,
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          return { ...t, pass: false, message: `Error: ${message}` }
        }
      })
    )
  }

  const runAllResponseTests = () => {
    if (!response) return
    const next = responseLineTests.map(t => {
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function('response', `return (${t.expression})`)
        const result = fn(response)
        return {
          ...t,
          pass: result === true,
          message: result === true ? 'OK' : `Falló: ${JSON.stringify(result)}`,
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ...t, pass: false, message: `Error: ${message}` }
      }
    })
    setResponseLineTests(next)
    const passed = next.filter(t => t.pass).length
    setResponseTestsSummary({ passed, total: next.length })
  }

  const generateTestFromResponse = () => {
    if (!response) {
      return
    }

    const bodyObj = (response.body && typeof response.body === 'object' && !Array.isArray(response.body))
      ? (response.body as Record<string, unknown>)
      : null
    const bodyKeys = bodyObj ? Object.keys(bodyObj).slice(0, 5) : []

    const generatedTests: ResponseLineTest[] = [
      { id: 'test-status-2xx', name: 'Status 2xx', expression: 'response.status >= 200 && response.status < 300' },
      ...bodyKeys.map((k) => ({
        id: `test-has-key-${k.replace(/[^a-zA-Z0-9_]/g, '_')}`,
        name: `Body tiene key "${k}"`,
        expression: `Object.prototype.hasOwnProperty.call(response.body, '${k}')`,
      })),
    ]

    setResponseLineTests(generatedTests)
    setResTab('test')
    setResponseTestsSummary(null)
  }

  const addManualResponseTest = () => {
    const id = `test-manual-${Date.now()}`
    setResponseLineTests(prev => [
      ...prev,
      {
        id,
        name: 'Test manual',
        expression: 'response.status === 200',
      },
    ])
    setResTab('test')
  }

  const sendAiPrompt = async () => {
    const prompt = aiPrompt.trim()
    if (!prompt) return

    setAiLoading(true)
    setAiMessages(prev => [...prev, { role: 'user', text: prompt }])
    setAiPrompt('')
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiProvider,
          model: aiModel.trim() || undefined,
          prompt: `${prompt}\n\nJSON actual del body request:\n${bodyContent || '{}'}`,
          system: AI_SYSTEM_PROMPT_STRICT_JSON,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Error IA')
      const assistantTextRaw = typeof data?.text === 'string' ? data.text : JSON.stringify(data, null, 2)
      const assistantText = formatJsonString(assistantTextRaw)
      if (!isValidJsonString(assistantText)) {
        throw new Error('La IA no devolvió JSON válido. Ajusta el prompt e intenta de nuevo.')
      }
      setAiMessages(prev => [...prev, { role: 'assistant', text: assistantText }])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setAiMessages(prev => [...prev, { role: 'assistant', text: `Error: ${msg}` }])
    } finally {
      setAiLoading(false)
    }
  }

  const useLastAiResponseInBody = () => {
    const lastAssistant = [...aiMessages].reverse().find(m => m.role === 'assistant')
    if (!lastAssistant) return
    setBodyContent(formatJsonString(lastAssistant.text))
  }

  const runAiDirectOnRaw = async () => {
    setAiLoading(true)
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiProvider,
          model: aiModel.trim() || undefined,
          prompt: `${AI_DIRECT_RAW_PROMPT}\n\nContexto de request:\n- method: ${method}\n- url: ${url || '(sin url)'}\n\nJSON actual del body request:\n${bodyContent || '{}'}`,
          system: AI_SYSTEM_PROMPT_STRICT_JSON,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Error IA')
      const aiTextRaw = typeof data?.text === 'string' ? data.text : JSON.stringify(data, null, 2)
      const aiText = formatJsonString(aiTextRaw)
      if (!isValidJsonString(aiText)) {
        throw new Error('La IA no devolvió JSON válido')
      }
      setBodyContent(aiText)
      setSaveMessage({ type: 'ok', text: 'Body actualizado por IA' })
      setTimeout(() => setSaveMessage(null), 2000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setSaveMessage({ type: 'error', text: `IA: ${msg}` })
      setTimeout(() => setSaveMessage(null), 3000)
    } finally {
      setAiLoading(false)
    }
  }

  const loadModelsForProvider = async (provider: 'anthropic' | 'deepseek' | 'ollama') => {
    setAiModelsLoading(true)
    setAiModelsError('')
    try {
      const res = await fetch(`/api/ai/models?provider=${provider}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'No fue posible cargar modelos')
      const models = Array.isArray(data?.models) ? (data.models as AiModelOption[]) : []
      setAiModelOptions(models)
      if (models.length > 0 && !models.some(m => m.id === aiModel)) {
        setAiModel(models[0].id)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setAiModelsError(msg)
      setAiModelOptions([])
    } finally {
      setAiModelsLoading(false)
    }
  }

  const activeProject = projects.find(p => p.id === activeProjectId)
  const activeRequest = activeProject?.requests.find(r => r.id === activeRequestId)
  const sidebarSearchLower = sidebarSearch.trim().toLowerCase()
  const usesBaseUrlVariable = /\{\{\s*baseUrl\s*\}\}/i.test(url)
  const rawBodyInvalid = bodyType === 'raw' && !isValidJsonString(bodyContent)
  const responseAutocompleteOptions = (() => {
    const base = [
      'response.status',
      'response.statusText',
      'response.headers',
      'response.body',
      'response.status >= 200 && response.status < 300',
      "Object.prototype.hasOwnProperty.call(response.body, 'key')",
    ]
    if (!response || typeof response.body !== 'object' || response.body === null || Array.isArray(response.body)) {
      return base
    }
    const bodyKeys = Object.keys(response.body as Record<string, unknown>).slice(0, 30)
    const bodyKeyOptions = bodyKeys.flatMap((k) => [
      `response.body.${k}`,
      `Object.prototype.hasOwnProperty.call(response.body, '${k}')`,
    ])
    return [...base, ...bodyKeyOptions]
  })()
  const groupedRequestsByProject = new Map(
    projects.map(project => {
      const byUrl = project.requests.reduce<Record<string, StoredRequest[]>>((acc, req) => {
        const groupKey = req.url?.trim() || '(sin url)'
        if (!acc[groupKey]) acc[groupKey] = []
        acc[groupKey].push(req)
        return acc
      }, {})
      return [project.id, byUrl]
    })
  )

  return (
    <div className="flex h-screen overflow-hidden" onKeyDown={handleKeyDown}>
      {/* Sidebar */}
      <div className="sidebar w-72 flex-shrink-0 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-[#3c3c3c] flex items-center justify-between">
          <h1 className="text-sm font-semibold text-white">Postman Clone</h1>
          <div className="flex gap-1">
            <button className="btn-secondary text-xs py-1 px-2" onClick={handleLogout}>Salir</button>
            <button className="btn-primary text-xs py-1 px-2" onClick={() => setShowNewProject(true)}>+</button>
            <button
              className="btn-primary text-xs py-1 px-2"
              onClick={() => fileInputRef.current?.click()}
              title="Importar Postman/OpenAPI JSON"
            >
              ⬇
            </button>
            <button
              className="btn-primary text-xs py-1 px-2"
              onClick={runAllTests}
              disabled={runningTests || projects.length === 0}
              title="Run All Tests"
            >
              {runningTests ? '···' : '▶'}
            </button>
          </div>
        </div>
        <div className="px-3 py-2 border-b border-[#3c3c3c]">
          <div className="flex items-center gap-2">
            <input
              className="w-full text-xs"
              placeholder="Buscar proyecto, URL o request..."
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
            />
            {sidebarSearch && (
              <button className="btn-secondary text-xs py-1 px-2" onClick={() => setSidebarSearch('')}>
                Limpiar
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-custom">
          {loadingProjects ? (
            <div className="p-4 text-sm text-gray-500">Cargando...</div>
          ) : projects.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">Sin proyectos. Crea uno nuevo.</div>
          ) : (
            projects
              .filter(project => {
                if (!sidebarSearchLower) return true
                const projectMatch = toSearchText(project.name).includes(sidebarSearchLower)
                if (projectMatch) return true
                return project.requests.some(req =>
                  toSearchText(req.name).includes(sidebarSearchLower) ||
                  toSearchText(req.url).includes(sidebarSearchLower)
                )
              })
              .map(project => (
              <div key={project.id}>
                <div
                  className={`flex items-center justify-between px-3 py-2 cursor-pointer text-sm hover:bg-[#2a2d2e] ${activeProjectId === project.id ? 'bg-[#37373d] text-white' : 'text-[#ccc]'}`}
                  onClick={() => setActiveProjectId(project.id)}
                >
                  <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                    <button
                      className="text-xs text-gray-400 hover:text-white py-0 px-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        setCollapsedProjects(prev => ({ ...prev, [project.id]: !prev[project.id] }))
                      }}
                      title={collapsedProjects[project.id] ? 'Expandir proyecto' : 'Colapsar proyecto'}
                    >
                      {collapsedProjects[project.id] ? '▸' : '▾'}
                    </button>
                    <span className="truncate">{project.name}</span>
                  </div>
                  <div className="flex gap-1">
                    <button className="text-xs text-gray-500 hover:text-white py-0 px-1" onClick={(e) => { e.stopPropagation(); addRequest(project.id) }}>+</button>
                    <button className="text-xs text-gray-500 hover:text-red-400 py-0 px-1" onClick={(e) => { e.stopPropagation(); deleteProject(project.id) }}>×</button>
                  </div>
                </div>
                {!collapsedProjects[project.id] && Object.entries(groupedRequestsByProject.get(project.id) || {})
                  .filter(([groupUrl, groupRequests]) => {
                    if (!sidebarSearchLower) return true
                    if (toSearchText(groupUrl).includes(sidebarSearchLower)) return true
                    return groupRequests.some(req => toSearchText(req.name).includes(sidebarSearchLower))
                  })
                  .map(([groupUrl, groupRequests]) => (
                  <div key={`${project.id}-${groupUrl}`}>
                    <div className="pl-6 pr-3 py-1 text-[11px] text-gray-500 truncate border-l border-[#3c3c3c] ml-3">
                      {groupUrl}
                    </div>
                    {groupRequests
                      .filter(req => {
                        if (!sidebarSearchLower) return true
                        return (
                          toSearchText(req.name).includes(sidebarSearchLower) ||
                          toSearchText(req.url).includes(sidebarSearchLower)
                        )
                      })
                      .map(req => (
                      <div
                        key={req.id}
                        className={`flex items-center pl-8 pr-3 py-1.5 cursor-pointer text-xs hover:bg-[#2a2d2e] ${activeRequestId === req.id ? 'bg-[#2a2d2e] text-white' : 'text-[#999]'}`}
                        onClick={() => selectRequest(req)}
                      >
                        <span className={`method-${req.method.toLowerCase()} font-bold mr-2 w-12 flex-shrink-0`}>{req.method}</span>
                        <span className="truncate flex-1">{req.name}</span>
                        <button className="text-gray-500 hover:text-red-400 py-0 px-1" onClick={(e) => { e.stopPropagation(); deleteRequest(req.id) }}>×</button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Request Bar */}
        <div className="p-3 flex items-center gap-2 request-panel border-b border-[#3c3c3c]">
          <input
            className="flex-1 text-sm"
            placeholder="Nombre de la solicitud"
            value={requestName}
            onChange={e => setRequestName(e.target.value)}
            onBlur={handleSave}
          />
          <button id="btn-open-env-modal" className="btn-secondary text-xs py-1 px-2" onClick={() => setShowEnvModal(true)}>
            Env
          </button>
          <button id="btn-open-ai-config-modal" className="btn-secondary text-xs py-1 px-2" onClick={() => setShowAiConfigModal(true)}>
            IA Config
          </button>
          {saveMessage && (
            <span className={`text-xs ${saveMessage.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
              {saveMessage.text}
            </span>
          )}
          {rawBodyInvalid && (
            <span className="text-xs text-red-400">Body raw debe ser un JSON válido.</span>
          )}
        </div>

        {/* Method + URL + Buttons */}
        <div className="px-3 py-2 flex items-center gap-2">
          <select
            className="w-28 text-sm font-bold method-get"
            value={method}
            onChange={e => setMethod(e.target.value)}
            style={{ color: `var(--${method.toLowerCase()})` || undefined }}
          >
            {METHODS.map(m => (
              <option key={m} value={m} className={`method-${m.toLowerCase()}`}>{m}</option>
            ))}
          </select>
          <input
            className={`flex-1 text-sm font-mono ${usesBaseUrlVariable ? 'text-blue-400' : ''} placeholder:text-blue-400`}
            placeholder="{{baseUrl}}/endpoint"
            value={url}
            onChange={e => setUrl(e.target.value)}
          />
          <button className="btn-primary text-sm" onClick={handleSend} disabled={loading || rawBodyInvalid}>
            {loading ? 'Enviando...' : 'Send'}
          </button>
          <button className="btn-secondary text-sm" onClick={handleSave} disabled={rawBodyInvalid}>Save</button>
        </div>

        {/* Tabs: Params | Headers | Body */}
        <div className="flex border-b border-[#3c3c3c] px-3">
          {['headers', 'body'].map(t => (
            <button
              key={t}
              className={`py-2 px-4 text-xs font-medium ${tab === t ? 'tab-active' : 'tab-inactive'}`}
              onClick={() => setTab(t as typeof tab)}
            >
              {t === 'headers' ? 'Headers' : 'Body'}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          {/* Tab Content */}
          <div className="h-[30%] min-h-0 overflow-y-auto scrollbar-custom px-3 py-2">
            {tab === 'headers' && (
              <div>
                <div className="flex text-xs text-gray-500 mb-1 px-2">
                  <span className="w-1/2">Key</span>
                  <span className="w-1/2">Value</span>
                </div>
                {headers.map((header, i) => (
                  <div key={i} className="flex gap-2 mb-1">
                  <input
                    className="flex-1 text-xs font-mono"
                    placeholder="Key"
                    list="header-key-options"
                    value={header.key}
                    onChange={e => {
                      const h = [...headers]
                      h[i].key = e.target.value
                        setHeaders(h)
                      }}
                    />
                  <input
                    className="flex-1 text-xs font-mono"
                    placeholder="Value"
                    list="header-value-options"
                    value={header.value}
                    onChange={e => {
                      const h = [...headers]
                      h[i].value = e.target.value
                        setHeaders(h)
                      }}
                    />
                    <button
                      className="text-gray-500 hover:text-red-400 text-sm"
                      onClick={() => setHeaders(headers.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  className="text-xs text-[#007acc] mt-1"
                  onClick={() => setHeaders([...headers, { key: '', value: '' }])}
                >
                  + Add header
                </button>
              </div>
            )}

            {tab === 'body' && (
              <div>
                <select
                  className="text-xs mb-2"
                  value={bodyType}
                  onChange={e => setBodyType(e.target.value)}
                >
                  <option value="none">none</option>
                  <option value="raw">raw</option>
                </select>
              {bodyType === 'raw' && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <textarea
                      ref={textareaRef}
                      className={`w-full h-40 text-xs font-mono ${rawBodyInvalid ? 'border-red-500' : ''}`}
                      placeholder='{"key": "value"}'
                      value={bodyContent}
                      onChange={e => setBodyContent(formatJsonString(e.target.value))}
                      onBlur={() => setBodyContent(prev => formatJsonString(prev))}
                    />
                  </div>
                  <div className="w-10 flex-shrink-0 flex flex-col items-end">
                    <button
                      id="btn-open-ai-chat-modal"
                      type="button"
                      className="btn-secondary text-xs py-1 px-2"
                      title="Asistente IA"
                      onClick={runAiDirectOnRaw}
                      disabled={aiLoading}
                    >
                      {aiLoading ? '...' : 'IA'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          </div>

          {/* Response Panel */}
          <div className="response-panel h-[70%] min-h-0 flex flex-col border-t border-[#3c3c3c]">
            <div className="flex items-center border-b border-[#3c3c3c] px-3">
              <div className="flex items-center gap-3">
                {['body', 'headers', 'request', 'test'].map(t => (
                  <button
                    key={t}
                    className={`py-2 text-xs font-medium ${resTab === t ? 'tab-active' : 'tab-inactive'}`}
                    onClick={() => setResTab(t as 'body' | 'headers' | 'request' | 'test')}
                  >
                    {t === 'body' ? 'Response' : t === 'headers' ? 'Headers' : t === 'request' ? 'Request' : 'Test'}
                  </button>
                ))}
              </div>
              {response && (
                <div className="ml-auto flex items-center gap-2">
                  <span className={`text-xs font-bold ${response.status >= 200 && response.status < 300 ? 'text-green-400' : response.status >= 400 ? 'text-red-400' : 'text-yellow-400'}`}>
                    {response.status} {response.statusText}
                  </span>
                  <span className="text-xs text-gray-500">{JSON.stringify(response.body, null, 2).length} bytes</span>
                </div>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-auto scrollbar-custom p-3">
              {!response && !loading && !testResults && !runningTests && (
                <div className="text-sm text-gray-500">Haz clic en Send para obtener una respuesta</div>
              )}
              {loading && <div className="text-sm text-gray-500">Enviando solicitud...</div>}
              {runningTests && (
                <div className="text-sm text-gray-500">Ejecutando todos los tests...</div>
              )}
              {testResults && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-white">
                      Tests: {testResults.filter(r => !r.error && r.status >= 200 && r.status < 400).length}/{testResults.length} OK
                    </span>
                    <button
                      className="text-xs text-gray-500 hover:text-white"
                      onClick={() => setTestResults(null)}
                    >
                      × Clear
                    </button>
                  </div>
                  {testResults.map((r, i) => (
                    <div
                      key={i}
                      className={`mb-1 p-2 rounded text-xs border ${r.error || r.status === 0 ? 'border-red-500/30 bg-red-500/10' : r.status >= 200 && r.status < 300 ? 'border-green-500/30 bg-green-500/10' : 'border-yellow-500/30 bg-yellow-500/10'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold method-${r.method.toLowerCase()}`}>{r.method}</span>
                          <span className="text-gray-300">{r.projectName} / {r.requestName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={r.error || r.status === 0 ? 'text-red-400' : r.status >= 200 && r.status < 300 ? 'text-green-400' : 'text-yellow-400'}>
                            {r.status} {r.statusText}
                          </span>
                          <span className="text-gray-500">{r.duration}ms</span>
                        </div>
                      </div>
                      <div className="text-gray-500 mt-1 truncate">{r.url}</div>
                    </div>
                  ))}
                </div>
              )}
              {response && !testResults && resTab === 'body' && (
                <pre id="pre-response-json" className="json-view text-xs font-mono whitespace-pre-wrap break-all">{renderJsonSyntax(response.body)}</pre>
              )}
              {response && !testResults && resTab === 'headers' && (
                <div className="text-xs font-mono">
                  {Object.entries(response.headers).map(([k, v]) => (
                    <div key={k} className="mb-0.5"><span className="text-blue-400">{k}:</span> {v}</div>
                  ))}
                </div>
              )}
              {resTab === 'request' && (
                <pre className="json-view text-xs font-mono whitespace-pre-wrap break-all">
                  {renderJsonSyntax(lastRequest ?? { message: 'Aún no se ha enviado ninguna petición' })}
                </pre>
              )}
              {resTab === 'test' && (
                <div className="space-y-2">
                  <div className="text-xs text-gray-400">Usa expresiones booleanas con `response.status`, `response.headers`, `response.body`.</div>
                  <div className="flex items-center gap-2">
                    <button className="btn-primary text-xs" onClick={runAllResponseTests}>Run All</button>
                    <button id="btn-generate-test-from-response" className="btn-secondary text-xs" onClick={generateTestFromResponse}>
                      Generar Test
                    </button>
                    <button id="btn-add-manual-test" className="btn-secondary text-xs" onClick={addManualResponseTest}>
                      Agregar Test
                    </button>
                  </div>
                  <div className="space-y-2">
                    {responseLineTests.map((t) => (
                      <div key={t.id} className="border border-[#3c3c3c] rounded p-2">
                        <div className="flex items-center gap-2 mb-1">
                          <input
                            className="flex-1 text-xs"
                            value={t.name}
                            onChange={e => setResponseLineTests(prev => prev.map(x => x.id === t.id ? { ...x, name: e.target.value } : x))}
                          />
                          <button className="btn-secondary text-xs py-1 px-2" onClick={() => runSingleResponseTest(t.id)}>Run</button>
                          <button
                            className="btn-secondary text-xs py-1 px-2 text-red-300"
                            onClick={() => setResponseLineTests(prev => prev.filter(x => x.id !== t.id))}
                          >
                            Eliminar
                          </button>
                        </div>
                        <input
                          className="w-full text-xs font-mono"
                          list="response-test-expression-options"
                          value={t.expression}
                          onChange={e => setResponseLineTests(prev => prev.map(x => x.id === t.id ? { ...x, expression: e.target.value } : x))}
                        />
                        {t.message && (
                          <div className={`text-xs mt-1 ${t.pass ? 'text-green-400' : 'text-red-400'}`}>{t.message}</div>
                        )}
                      </div>
                    ))}
                  </div>
                  {responseTestsSummary && (
                    <div className={`text-xs mt-2 ${responseTestsSummary.passed === responseTestsSummary.total ? 'text-green-400' : 'text-yellow-400'}`}>
                      Resultado: {responseTestsSummary.passed}/{responseTestsSummary.total} OK
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hidden file input for Postman import */}
      <datalist id="header-key-options">
        {STANDARD_HEADER_KEYS.map(k => (
          <option key={k} value={k} />
        ))}
      </datalist>
      <datalist id="header-value-options">
        {STANDARD_HEADER_VALUES.map(v => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="response-test-expression-options">
        {responseAutocompleteOptions.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImport}
        accept=".json,.yaml,.yml,application/json"
        className="hidden"
      />

      {/* New Project Modal */}
      {showNewProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNewProject(false)}>
          <div className="bg-[#252526] border border-[#3c3c3c] rounded-lg p-4 w-80" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-white mb-3">Nuevo proyecto</h2>
            <input
              className="w-full text-sm mb-3"
              placeholder="Nombre del proyecto"
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createProject()}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button className="btn-secondary text-xs" onClick={() => setShowNewProject(false)}>Cancelar</button>
              <button className="btn-primary text-xs" onClick={createProject}>Crear</button>
            </div>
          </div>
        </div>
      )}

      {showEnvModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowEnvModal(false)}>
          <div className="bg-[#252526] border border-[#3c3c3c] rounded-lg p-4 w-[560px] max-w-[92vw]" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-white mb-3">Environments</h2>
            <div className="space-y-2">
              <div>
                <div className="text-xs text-gray-400 mb-1">Base URL</div>
                <input
                  className="w-full text-xs font-mono"
                  placeholder="https://api.example.com"
                  value={baseUrl}
                  onChange={e => setBaseUrl(e.target.value)}
                />
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Token</div>
                <input
                  className="w-full text-xs font-mono"
                  placeholder="Bearer ... o token"
                  value={token}
                  onChange={e => setToken(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button className="btn-secondary text-xs" onClick={() => setShowEnvModal(false)}>Cerrar</button>
              <button
                className="btn-primary text-xs"
                onClick={async () => {
                  await handleSaveEnvironments()
                  setShowEnvModal(false)
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {showAiConfigModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAiConfigModal(false)}>
          <div className="bg-[#252526] border border-[#3c3c3c] rounded-lg p-4 w-[560px] max-w-[92vw]" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-white mb-3">Configuración IA Global</h2>
            <div className="space-y-2">
              <div>
                <div className="text-xs text-gray-400 mb-1">Proveedor</div>
                <select
                  id="select-ai-provider-config"
                  className="w-full text-xs"
                  value={aiProvider}
                  onChange={async e => {
                    const next = e.target.value as 'anthropic' | 'deepseek' | 'ollama'
                    setAiProvider(next)
                    await loadModelsForProvider(next)
                  }}
                >
                  <option value="deepseek">deepseek</option>
                  <option value="anthropic">anthropic</option>
                  <option value="ollama">ollama</option>
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs text-gray-400">Modelo</div>
                  <button
                    id="btn-ai-load-models"
                    className="btn-secondary text-xs py-1 px-2"
                    onClick={() => loadModelsForProvider(aiProvider)}
                    disabled={aiModelsLoading}
                  >
                    {aiModelsLoading ? 'Cargando...' : 'Cargar modelos'}
                  </button>
                </div>
                {aiModelOptions.length > 0 ? (
                  <select
                    id="select-ai-model-config"
                    className="w-full text-xs font-mono"
                    value={aiModel}
                    onChange={e => setAiModel(e.target.value)}
                  >
                    {aiModelOptions.map(m => (
                      <option key={m.id} value={m.id}>{m.id}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="input-ai-model-config"
                    className="w-full text-xs font-mono"
                    placeholder="modelo IA global"
                    value={aiModel}
                    onChange={e => setAiModel(e.target.value)}
                  />
                )}
                {aiModelsError && <div className="text-xs text-red-400 mt-1">{aiModelsError}</div>}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button id="btn-close-ai-config-modal" className="btn-primary text-xs" onClick={() => setShowAiConfigModal(false)}>Aceptar</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Project Name Modal */}
      {showImportDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowImportDialog(false)}>
          <div className="bg-[#252526] border border-[#3c3c3c] rounded-lg p-4 w-96" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-white mb-2">Importar colección</h2>
            <p className="text-xs text-gray-400 mb-3">Nombre del proyecto a crear en la base de datos:</p>
            <input
              className="w-full text-sm mb-3"
              placeholder="Nombre del proyecto"
              value={importProjectName}
              onChange={e => setImportProjectName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmImportCollection()}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                className="btn-secondary text-xs"
                onClick={() => {
                  setShowImportDialog(false)
                  setPendingImportCollection(null)
                }}
              >
                Cancelar
              </button>
              <button className="btn-primary text-xs" onClick={confirmImportCollection} disabled={!importProjectName.trim()}>
                Importar
              </button>
            </div>
          </div>
        </div>
      )}

      {showAiPanel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAiPanel(false)}>
          <div className="bg-[#252526] border border-[#3c3c3c] rounded-lg p-4 w-[560px] max-w-[92vw]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-white">Asistente IA</h2>
              <button id="btn-close-ai-chat-modal" className="text-xs text-gray-400 hover:text-white" onClick={() => setShowAiPanel(false)}>✕</button>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <select className="text-xs flex-1" value={aiProvider} onChange={e => setAiProvider(e.target.value as 'anthropic' | 'deepseek' | 'ollama')}>
                <option value="deepseek">deepseek</option>
                <option value="anthropic">anthropic</option>
                <option value="ollama">ollama</option>
              </select>
              <input
                className="text-xs flex-1"
                placeholder="modelo (opcional)"
                value={aiModel}
                onChange={e => setAiModel(e.target.value)}
              />
            </div>
            <div className="h-44 overflow-auto text-xs font-mono border border-[#3c3c3c] rounded p-2 mb-2">
              {aiMessages.length === 0 && <div className="text-gray-500">Haz una pregunta para generar JSON</div>}
              {aiMessages.map((m, idx) => (
                <div key={`${m.role}-${idx}`} className={`mb-1 ${m.role === 'user' ? 'text-blue-300' : 'text-green-300'}`}>
                  <strong>{m.role === 'user' ? 'Tú' : 'IA'}:</strong> {m.text}
                </div>
              ))}
            </div>
            <textarea
              id="textarea-ai-prompt"
              className="w-full h-20 text-xs font-mono mb-2"
              placeholder={AI_PROMPT_PLACEHOLDER_BODY}
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button id="btn-ai-use-in-body" className="btn-secondary text-xs py-1 px-2" onClick={useLastAiResponseInBody}>
                Usar en Body
              </button>
              <button id="btn-ai-send-prompt" className="btn-primary text-xs py-1 px-2" onClick={sendAiPrompt} disabled={aiLoading || !aiPrompt.trim()}>
                {aiLoading ? '...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
