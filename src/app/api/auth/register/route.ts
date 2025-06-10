'use Server'
import { NextRequest, NextResponse } from 'next/server'
import * as z from 'zod'
import { RegisterSchema } from '@/schemas'
import { db } from '@/lib/db'
import bcrypt from 'bcrypt'
import { getUserByEmail } from '@/Data/user'
import { login } from '@/actions/login'
import { generateVerifcationToken } from '@/lib/tokens'
import { sendVerificationEmail } from '@/lib/mail'

export async function POST(req: NextRequest) {

  const data: z.infer<typeof RegisterSchema> = await req.json()
  console.log("data", data)

  const {email, name, password} =  data

  const hashedPassword = await bcrypt.hash(password, 10)

  const existingUser = await getUserByEmail(email)
  
  if (existingUser) {
    return NextResponse.json({ error: 'Email already exists' }, { status: 400 })
  }

  await db.user.create({
    data: {
      email,
      name,
      password: hashedPassword,
    },
  })
  function setError(error: string) {
    throw new Error('Function not implemented.')
  }

  const verificationToken = await generateVerifcationToken(email)
  if (!verificationToken) {
    return NextResponse.json({ error: 'Confirmation email could not be sent' })
  }
  await sendVerificationEmail(verificationToken.email, verificationToken.token)
  
  //TODO: send verfication email


  login(data).then((data) => {
        if(data?.error){
          setError(data.error)
        }
      }
    )
  return NextResponse.json({success: "Pls verify ur Account.\n Confirmation email sent."})
}


