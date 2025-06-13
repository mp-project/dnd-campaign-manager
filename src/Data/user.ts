import { db } from '@/lib/db'

export const getUserByEmail = async (email: string) => {
  try{
    const user = await db.user.findFirst({
      where: {
        email
      }
    })
    return user
  }
  catch(err){
    return null
  }
}
export const getUserById = async (id: string) => {
  try {
    const user = await db.user.findFirst({
      where: {
        id,
      },
    })
    return user
  } catch (err) {
    return null
  }
}

export const emailIsVerified = async (email: string) => {
  try {
    const user = await db.user.findFirst({
      where: {
        email,
      },
    })
    return user
  } catch (err) {
    return null
  }
}