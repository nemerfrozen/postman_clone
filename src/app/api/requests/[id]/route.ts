import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const request = await prisma.request.update({
    where: { id },
    data: {
      name: body.name,
      method: body.method,
      url: body.url,
      headers: body.headers,
      bodyType: body.bodyType,
      bodyContent: body.bodyContent,
    },
  })
  return NextResponse.json(request)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.request.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
