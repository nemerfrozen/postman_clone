import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')?.trim() || ''
  if (!url) return NextResponse.json({ tests: [] })

  const requestTest = (prisma as unknown as {
    requestTest?: {
      findMany: (args: unknown) => Promise<Array<{ id: string; name: string; expression: string }>>
    }
  }).requestTest

  if (!requestTest) {
    return NextResponse.json({ tests: [] })
  }

  const tests = await requestTest.findMany({
    where: { url },
    orderBy: { sortOrder: 'asc' },
  })

  return NextResponse.json({
    tests: tests.map(t => ({
      id: t.id,
      name: t.name,
      expression: t.expression,
    })),
  })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const requestId = typeof body?.requestId === 'string' ? body.requestId : ''
  const url = typeof body?.url === 'string' ? body.url : ''
  const tests = Array.isArray(body?.tests) ? body.tests : []

  if (!requestId) return NextResponse.json({ error: 'requestId is required' }, { status: 400 })

  const requestTest = (prisma as unknown as {
    requestTest?: {
      deleteMany: (args: unknown) => Promise<unknown>
      createMany: (args: unknown) => Promise<unknown>
    }
  }).requestTest

  if (!requestTest) {
    return NextResponse.json({ error: 'Prisma client is outdated. Run prisma generate/deploy migrations.' }, { status: 500 })
  }

  await prisma.$transaction(async (tx) => {
    const txRequestTest = (tx as unknown as {
      requestTest: {
        deleteMany: (args: unknown) => Promise<unknown>
        createMany: (args: unknown) => Promise<unknown>
      }
    }).requestTest

    await txRequestTest.deleteMany({ where: { requestId } })

    if (tests.length > 0) {
      await txRequestTest.createMany({
        data: tests.map((t: { name?: string; expression?: string }, idx: number) => ({
          requestId,
          url,
          name: t.name || `Test ${idx + 1}`,
          expression: t.expression || 'response.status >= 200 && response.status < 300',
          sortOrder: idx,
        })),
      })
    }
  })

  return NextResponse.json({ success: true })
}
