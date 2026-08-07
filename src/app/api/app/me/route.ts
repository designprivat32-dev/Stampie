import { NextResponse } from 'next/server'
import { requireAppUser } from '@/lib/auth/app-session'

export const runtime = 'nodejs'

/** Who am I? Used by the app after login to know the business + whether to force a password change. */
export async function GET(request: Request): Promise<Response> {
  const appUser = await requireAppUser(request)
  if (!appUser) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })

  return NextResponse.json({
    username: appUser.username,
    name: appUser.name,
    org: { id: appUser.orgId, name: appUser.orgName },
    role: appUser.role,
    mustChangePassword: appUser.mustChangePassword,
  })
}
