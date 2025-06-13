'use client'
import { Disclosure, DisclosureButton, DisclosurePanel, Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react';
import { BellIcon, MenuIcon, XIcon } from '@heroicons/react/outline'
import React from 'react';
import Image from 'next/image'
import { UserIcon } from '../ui/user-icon';


type NavigationItem = {
  name: string;
  href: string;
  current: boolean;
};

type UserNavigationItem = {
  name: string;
  href: string;
};

type User = {
  name: string;
  email: string;
  imageUrl: string;
};

type NavbarProps = {
  navigation: NavigationItem[];
  userNavigation: UserNavigationItem[];
  user?: User;
  logoutForm?: React.ReactNode;
};

const navigation = [
    { name: 'Home', href: '/', current: true },
]

const userNavigation = [
    { name: 'Profile', href: '/profile' },
    { name: 'Dashboard', href: '/dashboard' },
]

function classNames(...classes: string[]) {
    return classes.filter(Boolean).join(' ')
}

export const Navbar: React.FC<NavbarProps> = ({ user, logoutForm }) => {
    return (
        <Disclosure as='nav' className='bg-gray-800'>
            <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
                <div className='flex h-16 items-center justify-between'>
                    <div className='flex items-center'>
                        <div className='flex-shrink-0'>
                            <Image className='nav-logo' alt='logo' src='/logo_panda_light.svg' width={60} height={60} />
                            {/* <Image className='theme-light' alt='logo' src='/logo_panda.svg' width={60} height={60} /> */}
                        </div>
                        <div className='hidden md:block'>
                            <div className='ml-10 flex items-baseline space-x-4'>
                                {navigation.map((item) => (
                                    <a
                                        key={item.name}
                                        href={item.href}
                                        aria-current={item.current ? 'page' : undefined}
                                        className={classNames(
                                            item.current
                                                ? 'bg-gray-900 text-white'
                                                : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                                            'rounded-md px-3 py-2 text-sm font-medium'
                                        )}
                                    >
                                        {item.name}
                                    </a>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className='hidden md:block'>
                        <div className='ml-4 flex items-center md:ml-6'>
                            <button
                                type='button'
                                className='relative rounded-full bg-gray-800 p-1 text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800'
                            >
                                <span className='absolute -inset-1.5' />
                                <span className='sr-only'>View notifications</span>
                                <BellIcon aria-hidden='true' className='h-6 w-6' />
                            </button>

                            {/* Profile dropdown */}
                            <Menu as='div' className='relative ml-3'>
                                <div>
                                    <MenuButton className='relative flex max-w-xs items-center rounded-full bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800'>
                                        <span className='absolute -inset-1.5' />
                                        <span className='sr-only'>Open user menu</span>
                                        <UserIcon variant='white' />
                                    </MenuButton>
                                </div>
                                <Transition
                                    as={React.Fragment}
                                    enter='transition ease-out duration-100'
                                    enterFrom='transform opacity-0 scale-95'
                                    enterTo='transform opacity-100 scale-100'
                                    leave='transition ease-in duration-75'
                                    leaveFrom='transform opacity-100 scale-100'
                                    leaveTo='transform opacity-0 scale-95'
                                >
                                    <MenuItems className='absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none'>
                                        {userNavigation.map((item) => (
                                            <MenuItem key={item.name}>
                                                {({ focus }) => (
                                                    <a
                                                        href={item.href}
                                                        className={classNames(
                                                            focus ? 'bg-gray-100' : '',
                                                            'block px-4 py-2 text-sm text-gray-700'
                                                        )}
                                                    >
                                                        {item.name}
                                                    </a>
                                                )}
                                            </MenuItem>
                                        ))}
                                    </MenuItems>
                                </Transition>
                            </Menu>
                        </div>
                    </div>
                    <div className='-mr-2 flex md:hidden'>
                        {/* Mobile menu button */}
                        <DisclosureButton className='group relative inline-flex items-center justify-center rounded-md bg-gray-800 p-2 text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800'>
                            <span className='absolute -inset-0.5' />
                            <span className='sr-only'>Open main menu</span>
                        </DisclosureButton>
                    </div>
                </div>
            </div>

            <DisclosurePanel className='md:hidden'>
                <div className='space-y-1 px-2 pb-3 pt-2 sm:px-3'>
                    {navigation.map((item) => (
                        <DisclosureButton
                            key={item.name}
                            as='a'
                            href={item.href}
                            aria-current={item.current ? 'page' : undefined}
                            className={classNames(
                                item.current
                                    ? 'bg-gray-900 text-white'
                                    : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                                'block rounded-md px-3 py-2 text-base font-medium'
                            )}
                        >
                            {item.name}
                        </DisclosureButton>
                    ))}
                </div>
                {user && (
                    <div className='border-t border-gray-700 pb-3 pt-4'>
                        <div className='flex items-center px-5'>
                            <div className='flex-shrink-0'></div>
                            <div className='ml-3'>
                                <div className='text-base font-medium leading-none text-white'>
                                    {user.name}
                                </div>
                                <div className='text-sm font-medium leading-none text-gray-400'>
                                    {user.email}
                                </div>
                            </div>
                            <button
                                type='button'
                                className='relative ml-auto flex-shrink-0 rounded-full bg-gray-800 p-1 text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800'
                            >
                                <span className='absolute -inset-1.5' />
                                <span className='sr-only'>View notifications</span>
                                <BellIcon aria-hidden='true' className='h-6 w-6' />
                            </button>
                        </div>
                        <div className='mt-3 space-y-1 px-2'>
                            {userNavigation.map((item) => (
                                <DisclosureButton
                                    key={item.name}
                                    as='a'
                                    href={item.href}
                                    className='block rounded-md px-3 py-2 text-base font-medium text-gray-400 hover:bg-gray-700 hover:text-white'
                                >
                                    {item.name}
                                </DisclosureButton>
                            ))}
                        </div>
                    </div>
                )}
            </DisclosurePanel>
        </Disclosure>
    )
}
