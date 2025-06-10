// app/api/logout/route.ts
import { NextResponse } from 'next/server'
import { signOut } from '@/auth' 

export async function POST() {
    try {
        await signOut() 
        return NextResponse.redirect('/auth/login') 
    } catch (error) {
        console.error('Logout fehlgeschlagen', error)
        return NextResponse.json({ error: 'Logout fehlgeschlagen' }, { status: 500 })
    }
}
