import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { db } from '@/lib/db'
import authConfig from '@/auth.config'
import { getUserById } from './Data/user'
import { UserRole } from '@prisma/client'


import { type DefaultSession } from 'next-auth'

export type ExtendedUser = {
  imageUrl: any
  email: any
  name: any
  role: UserRole
}
declare module 'next-auth' {
  interface Session {
    user: ExtendedUser
  }
}


export const { handlers: {GET, POST}, auth, signIn, signOut } = NextAuth({
  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
  },
  events: {
    async linkAccount({ user }) {
      await db.user.update({
        where: { id: user.id },
        data: {
          emailVerified: new Date()
        }
      })
    }
  },
  callbacks: {
    async signIn({ user, account }) {
      if(account?.provider !== "credentials") {
        return true
      }
      
      const existingUser = await getUserById(user?.id || '')
      // prevent login if user does not exist or email is not verified
      if(!existingUser || !existingUser.emailVerified) {
        return false
      }
      //TODO: Add 2FA check
      return true
    },
    async session({token, session}) {
      if(token.sub && session.user) {
        session.user.id = token.sub
      }
      if(token.role && session.user) {
        session.user.role = token.role as UserRole
      }
      return session
    },
    async jwt({token}) {
      if(!token.sub) return token

      const existingUser = await getUserById(token.sub)

      if(!existingUser) return token

      token.role = existingUser.role
      return token
    },  
  },
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  ...authConfig,
})