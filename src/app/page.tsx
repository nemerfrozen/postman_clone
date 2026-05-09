'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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
  body: string
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

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const ENV_STORAGE_PREFIX = 'postman-clone-env:'

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
  const [resTab, setResTab] = useState<'body' | 'headers'>('body')
  const [tab, setTab] = useState<'params' | 'headers' | 'body'>('headers')
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [token, setToken] = useState('')
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [testResults, setTestResults] = useState<TestResult[] | null>(null)
  const [runningTests, setRunningTests] = useState(false)
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

  const selectRequest = (req: StoredRequest) => {
    setActiveRequestId(req.id)
    setMethod(req.method)
    setUrl(req.url)
    setRequestName(req.name)
    setBodyType(req.bodyType)
    setBodyContent(req.bodyContent)
    try {
      setHeaders(JSON.parse(req.headers))
    } catch {
      setHeaders([{ key: '', value: '' }])
    }
    setResponse(null)
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
    await fetch(`/api/requests/${activeRequestId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    loadProjects()
  }

  const handleSaveEnvironments = async () => {
    if (!activeProjectId) return
    await fetch(`/api/projects/${activeProjectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl, token }),
    })
    loadProjects()
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
    const fullUrl = resolveUrl(url, baseUrl, token)
    try {
      const cleanedHeaders = headers
        .filter(h => h.key && h.value)
        .map(h => ({
          key: applyEnvironments(h.key, baseUrl, token),
          value: applyEnvironments(h.value, baseUrl, token),
        }))
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method,
          url: fullUrl,
          headers: JSON.stringify(cleanedHeaders),
          body: bodyType === 'raw' ? applyEnvironments(bodyContent, baseUrl, token) : undefined,
          bodyType,
        }),
      })
      const data = await res.json()
      setResponse(data)
    } catch {
      setResponse({ status: 0, statusText: 'Error', headers: {}, body: 'Error de conexión' })
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
          parsedHeaders = JSON.stringify(parsed.map(h => ({
            key: applyEnvironments(h.key || '', projectBaseUrl, projectToken),
            value: applyEnvironments(h.value || '', projectBaseUrl, projectToken),
          })))
        } catch {
          parsedHeaders = '[]'
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
          body: typeof data.body === 'string' ? data.body.slice(0, 500) : JSON.stringify(data.body).slice(0, 500),
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
          body: 'Error de conexión',
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
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      })
      const data = await res.json()
      if (res.ok) {
        await loadProjects()
        setActiveProjectId(data.id)
        if (data.requests?.length > 0) {
          selectRequest(data.requests[0])
        }
      } else {
        setResponse({ status: 400, statusText: 'Error', headers: {}, body: data.error || 'Error al importar' })
      }
    } catch {
      setResponse({ status: 400, statusText: 'Error', headers: {}, body: 'Archivo JSON inválido' })
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
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

  const activeProject = projects.find(p => p.id === activeProjectId)
  const activeRequest = activeProject?.requests.find(r => r.id === activeRequestId)

  return (
    <div className="flex h-screen overflow-hidden" onKeyDown={handleKeyDown}>
      {/* Sidebar */}
      <div className="sidebar w-72 flex-shrink-0 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-[#3c3c3c] flex items-center justify-between">
          <h1 className="text-sm font-semibold text-white">Postman Clone</h1>
          <div className="flex gap-1">
            <button className="btn-primary text-xs py-1 px-2" onClick={() => setShowNewProject(true)}>+</button>
            <button
              className="btn-primary text-xs py-1 px-2"
              onClick={() => fileInputRef.current?.click()}
              title="Importar Postman JSON"
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
        <div className="flex-1 overflow-y-auto scrollbar-custom">
          {loadingProjects ? (
            <div className="p-4 text-sm text-gray-500">Cargando...</div>
          ) : projects.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">Sin proyectos. Crea uno nuevo.</div>
          ) : (
            projects.map(project => (
              <div key={project.id}>
                <div
                  className={`flex items-center justify-between px-3 py-2 cursor-pointer text-sm hover:bg-[#2a2d2e] ${activeProjectId === project.id ? 'bg-[#37373d] text-white' : 'text-[#ccc]'}`}
                  onClick={() => setActiveProjectId(project.id)}
                >
                  <span className="truncate flex-1">{project.name}</span>
                  <div className="flex gap-1">
                    <button className="text-xs text-gray-500 hover:text-white py-0 px-1" onClick={(e) => { e.stopPropagation(); addRequest(project.id) }}>+</button>
                    <button className="text-xs text-gray-500 hover:text-red-400 py-0 px-1" onClick={(e) => { e.stopPropagation(); deleteProject(project.id) }}>×</button>
                  </div>
                </div>
                {activeProjectId === project.id && project.requests.map(req => (
                  <div
                    key={req.id}
                    className={`flex items-center pl-6 pr-3 py-1.5 cursor-pointer text-xs hover:bg-[#2a2d2e] ${activeRequestId === req.id ? 'bg-[#2a2d2e] text-white' : 'text-[#999]'}`}
                    onClick={() => selectRequest(req)}
                  >
                    <span className={`method-${req.method.toLowerCase()} font-bold mr-2 w-12 flex-shrink-0`}>{req.method}</span>
                    <span className="truncate flex-1">{req.name}</span>
                    <button className="text-gray-500 hover:text-red-400 py-0 px-1" onClick={(e) => { e.stopPropagation(); deleteRequest(req.id) }}>×</button>
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
        </div>

        {/* Environments */}
        <div className="px-3 py-2 flex items-center gap-2 border-b border-[#3c3c3c]">
          <span className="text-xs text-gray-500 w-16 flex-shrink-0">Base URL</span>
          <input
            className="flex-1 text-xs font-mono"
            placeholder="https://api.example.com"
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            onBlur={handleSaveEnvironments}
          />
          <span className="text-xs text-gray-500 w-12 flex-shrink-0">Token</span>
          <input
            className="flex-1 text-xs font-mono"
            placeholder="Bearer ... o token"
            value={token}
            onChange={e => setToken(e.target.value)}
            onBlur={handleSaveEnvironments}
          />
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
            className="flex-1 text-sm font-mono"
            placeholder="https://api.example.com/endpoint"
            value={url}
            onChange={e => setUrl(e.target.value)}
          />
          <button className="btn-primary text-sm" onClick={handleSend} disabled={loading}>
            {loading ? 'Enviando...' : 'Send'}
          </button>
          <button className="btn-secondary text-sm" onClick={handleSave}>Save</button>
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

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto scrollbar-custom px-3 py-2">
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
                <textarea
                  ref={textareaRef}
                  className="w-full h-40 text-xs font-mono"
                  placeholder='{"key": "value"}'
                  value={bodyContent}
                  onChange={e => setBodyContent(e.target.value)}
                />
              )}
            </div>
          )}
        </div>

        {/* Response Panel */}
        <div className="response-panel flex-shrink-0">
          <div className="flex items-center border-b border-[#3c3c3c] px-3">
            <div className="flex items-center gap-3">
              {['body', 'headers'].map(t => (
                <button
                  key={t}
                  className={`py-2 text-xs font-medium ${resTab === t ? 'tab-active' : 'tab-inactive'}`}
                  onClick={() => setResTab(t as typeof resTab)}
                >
                  {t === 'body' ? 'Response' : 'Headers'}
                </button>
              ))}
            </div>
            {response && (
              <div className="ml-auto flex items-center gap-2">
                <span className={`text-xs font-bold ${response.status >= 200 && response.status < 300 ? 'text-green-400' : response.status >= 400 ? 'text-red-400' : 'text-yellow-400'}`}>
                  {response.status} {response.statusText}
                </span>
                <span className="text-xs text-gray-500">{response.body.length} bytes</span>
              </div>
            )}
          </div>
          <div className="overflow-auto max-h-64 scrollbar-custom p-3">
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
              <pre className="text-xs font-mono whitespace-pre-wrap break-all">{response.body}</pre>
            )}
            {response && !testResults && resTab === 'headers' && (
              <div className="text-xs font-mono">
                {Object.entries(response.headers).map(([k, v]) => (
                  <div key={k} className="mb-0.5"><span className="text-blue-400">{k}:</span> {v}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hidden file input for Postman import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImport}
        accept=".json,application/json"
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
    </div>
  )
}
