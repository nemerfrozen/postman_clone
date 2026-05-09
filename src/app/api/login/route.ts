import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const SESSION_COOKIE = 'pc_session'

async function ensureAdminUser() {
  await prisma.appUser.upsert({
    where: { username: 'admin' },
    update: { password: 'Q1w2e3r4/*' },
    create: { username: 'admin', password: 'Q1w2e3r4/*' },
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const username = typeof body.username === 'string' ? body.username.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!username || !password) {
      return NextResponse.json({ error: 'Usuario y clave son obligatorios' }, { status: 400 })
    }

    await ensureAdminUser()

    const user = await prisma.appUser.findUnique({ where: { username } })
    if (!user || user.password !== password) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    const res = NextResponse.json({ success: true })
    res.cookies.set(SESSION_COOKIE, 'ok', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 12,
    })

    return res
  } catch {
    return NextResponse.json({ error: 'Error al iniciar sesión' }, { status: 500 })
  }
}
