import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUser } from '@fortawesome/free-solid-svg-icons'
import React from 'react'
import { Roles } from '../../enums/userRole'
import { IconProp } from '@fortawesome/fontawesome-svg-core'

// Definiere die Typen für die möglichen Varianten
type Variant = 'dark' | 'white'

interface UserIconProps extends React.HTMLAttributes<HTMLDivElement> {
    role?: Roles
    variant?: Variant
}
/**
 * UserIcon ist ein Icon, das einen Benutzer darstellt.
 * @param {UserIconProps} props
 * @param {Variant} props.variant - Die Farbvariante des Icons
 * @param {Roles} props.role - Die Rolle des Benutzers
 * variant: 'dark' | 'white'
 * @example <UserIcon variant="dark" />
 */
const UserIcon = React.forwardRef<HTMLDivElement, UserIconProps>(function UserIcon(
    {variant = 'dark', role, ...props },
    ref
) {
    const iconStyle =
        variant === 'dark'
            ? { color: '#000000' } 
            : { color: '#ffffff' }

    const iconImg =
        role === 'SUPER_ADMIN' || role === 'ADMIN'
            ? '/public/admin-icon.svg'
            : faUser

    return (
        <div ref={ref} {...props}>
            {typeof iconImg === 'string' ? (
                <img src={iconImg} style={iconStyle} alt="user icon" />
            ) : (
                <FontAwesomeIcon icon={iconImg as IconProp} style={iconStyle} />
            )}
        </div>
    )
})

export { UserIcon }


