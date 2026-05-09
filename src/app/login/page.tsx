'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'No fue posible iniciar sesión')
        return
      }

      router.replace('/')
      router.refresh()
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-[#252526] border border-[#3c3c3c] rounded-lg p-5">
        <h1 className="text-white text-lg font-semibold mb-4">Iniciar sesión</h1>

        <label className="block text-xs text-gray-400 mb-1">Usuario</label>
        <input
          className="w-full mb-3 px-3 py-2 rounded bg-[#1e1e1e] border border-[#3c3c3c] text-sm text-white"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
        />

        <label className="block text-xs text-gray-400 mb-1">Clave</label>
        <input
          type="password"
          className="w-full mb-4 px-3 py-2 rounded bg-[#1e1e1e] border border-[#3c3c3c] text-sm text-white"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        {error && <div className="text-xs text-red-400 mb-3">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 rounded bg-[#007acc] hover:bg-[#1192f6] disabled:opacity-60 text-sm text-white"
        >
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}
