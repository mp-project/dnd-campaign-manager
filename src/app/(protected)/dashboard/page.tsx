import { auth, signOut } from '@/auth'
import { Navbar } from '@/components/navigation/navbar'

const DashboardPage = async () => {
    const session = await auth()

    const user = session?.user ? {
        name: session.user.name,
        email: session.user.email,
        imageUrl: session.user.imageUrl
    } : undefined

    return (
        <>
            <Navbar user={user} navigation={[]} userNavigation={[]} />

            <div>
                Session: {JSON.stringify(session)}
                <br />

                <form
                    action={async () => {
                        'use server'
                        await signOut()
                    }}
                >
                    <button type='submit'>Sign Out</button>
                </form>
            </div>
        </>
    )
}

export default DashboardPage