// middleware.ts
import { auth } from '@/auth/auth.config'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
    const session = await auth()

    // Falls keine Session vorhanden → Redirect zur Login-Seite
    if (!session) {
        const url = req.nextUrl.clone()
        url.pathname = '/auth/login'
        return NextResponse.redirect(url)
    }

    return NextResponse.next()
}

// Definiere, welche Routen geschützt werden sollen:
export const config = {
    matcher: ['/protected/:path*'],
}
