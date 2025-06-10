import { v4 as uuidv4 } from 'uuid'
import { db } from '@/lib/db'
import { getVerificationTokenByEmail } from '@/Data/verification-token'


/**
* Generate a verification token for a given email
* @param email: string
* @returns Promise (verification token expires 1 hour from now)
*/
export const generateVerifcationToken = async (email: string) => {
  try {
    const token = uuidv4()
    const expiresAt = new Date(new Date().getTime() + 3600 * 1000 )

    const existingToken = await getVerificationTokenByEmail(email)
    if(existingToken) {
      await db.verificationToken.delete({
        where: {
          id: existingToken.id
        }
      })
    }

    const verificationToken = await db.verificationToken.create({
      data: {
        email,
        token,
        expiresAt,
      }
    })
    
    return verificationToken
  }
  catch (error) {
    return null
  }
}