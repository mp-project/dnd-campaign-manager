import { auth, signOut } from '@/auth'
import { Navbar } from '@/components/navigation/navbar'

const DashboardPage = async () => {
    const session = await auth()

    const user = session?.user ? {
        name: session.user.name,
        email: session.user.email,
        imageUrl: session.user.imageUrl
    } : undefined
    const logoutForm = (
        <form
            action={async () => {
                'use server'
                await signOut()
            }}
        >
            <button type='submit'>Sign Out</button>
        </form>
    )
    return (
        <>
            <Navbar user={user} logoutForm={logoutForm} navigation={[]} userNavigation={[]} />

            <div>
                Session: {JSON.stringify(session)}
                <br />

                
            </div>
        </>
    )
}

export default DashboardPage