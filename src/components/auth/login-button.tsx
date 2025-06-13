"use client"
import {useRouter} from "next/navigation"

interface LoginButtonProps {
    children: React.ReactNode
    mode?: 'modal' | 'redirect'
    asChild?: boolean
    className?: string
}

export const LoginButton: React.FC<LoginButtonProps> = ({
    children,
    mode = 'redirect',
    asChild,
    className,
}) => {
    const router = useRouter()

    const onClick = () => {
        router.push('/auth/login')
    }

    if (mode === 'modal') {
        return <span>Implement Model</span>
    }
    return (
        <span onClick={onClick} className={className}>
            {children}
        </span>
    )
}