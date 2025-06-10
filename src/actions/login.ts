'use server'

import * as z from 'zod'
import { AuthError } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { signIn } from '@/auth'
import { LoginSchema } from '@/schemas'
import { getUserByEmail } from '@/Data/user'
import { DEFAULT_LOGIN_REDIRECT } from '@/routes'
import { generateVerifcationToken } from '@/lib/tokens'
import { sendVerificationEmail } from '@/lib/mail'


export const login = async (values: z.infer<typeof LoginSchema>) => {
  const validatedFields = LoginSchema.safeParse(values)

  if (!validatedFields.success) {
    return { error: 'Invalid fields!' }
  }

  const { email, password } = validatedFields.data

  const existingUser = await getUserByEmail(email)

  if (!existingUser || !existingUser.email || !existingUser.password) {
    return { error: 'Email does not exist or password is incorrect' }
  }

  if(!existingUser.emailVerified){
    const verificationToken = await generateVerifcationToken(existingUser.email)
    if (!verificationToken) {
        return NextResponse.json({ error: 'Confirmation email could not be sent' })
    }
    await sendVerificationEmail(verificationToken.email, verificationToken.token)
    return { 
      success: 'Pls verify ur Account. Confirmation email sent.' 
    }
  }

  try {
    // console.log('email', email)
    // console.log('password', password)
    await signIn('credentials', {
      email,
      password,
      redirectTo: DEFAULT_LOGIN_REDIRECT,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      console.log('error', error.type)
      switch (error.type) {
        case 'CredentialsSignin':
          return { error: 'Invalid credentials!' }
        default:
          return { error: 'Something went wrong!' }
      }
    }

    throw error
  }
}
