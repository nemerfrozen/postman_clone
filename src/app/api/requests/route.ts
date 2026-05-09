import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const request = await prisma.request.create({
    data: {
      name: body.name,
      method: body.method || 'GET',
      url: body.url || '',
      headers: body.headers || '[]',
      bodyType: body.bodyType || 'none',
      bodyContent: body.bodyContent || '',
      projectId: body.projectId,
    },
  })
  return NextResponse.json(request, { status: 201 })
}
