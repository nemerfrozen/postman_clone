import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const projects = await prisma.project.findMany({
    include: { requests: true },
    orderBy: { updatedAt: 'desc' },
  })
  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const project = await prisma.project.create({
    data: {
      name: body.name,
      baseUrl: body.baseUrl || '',
      token: body.token || '',
      requests: {
        create: {
          name: 'Nueva solicitud',
          method: 'GET',
          url: '',
        },
      },
    },
    include: { requests: true },
  })
  return NextResponse.json(project, { status: 201 })
}
