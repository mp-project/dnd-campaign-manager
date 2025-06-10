'use Server'
import { NextRequest, NextResponse } from 'next/server'
import * as z from 'zod'
import { LoginSchema } from '@/schemas'
import { signIn } from '@/auth'
import { DEFAULT_LOGIN_REDIRECT } from '@/routes'
import { AuthError } from 'next-auth'

export async function POST(req: NextRequest) {

  const data: z.infer<typeof LoginSchema> = await req.json()

  const {email, password} =  data

  try{
    const redirectUrl = await signIn('credentials', {
      email,
      password,
      redirect: false
    })
    console.log("redirectUrl", redirectUrl)
    return Response.redirect(DEFAULT_LOGIN_REDIRECT)

  } catch (error) {
    if(error instanceof AuthError){
      console.log("error", error)
      switch (error.type) {
        case 'CredentialsSignin':
          return NextResponse.json({ error: error.message }, { status: 400 })
        default:
          return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }
  }
}