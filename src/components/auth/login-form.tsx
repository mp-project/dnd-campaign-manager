'use client'
import { CardWrapper } from '@/components/auth/card-wrapper'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { LoginSchema } from '@/schemas'
import { Input } from '@/components/ui/input'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/form-error'
import { FormSuccess } from '@/components/form-success'
import { useTransition } from 'react'
import { useState } from 'react'
import { login } from '@/actions/login'
import { useSearchParams } from 'next/navigation'

import {
  Form,
  FormControl,
  FormField,
  FormLabel,
  FormMessage,
  FormItem,
} from '@/components/ui/form'

export const LoginForm = () => {

  const searchParams = useSearchParams()
  const urlError = searchParams.get('error') === "OAuthAccountNotLinked" ? "Email already in use with another provider!" : ""

  const [isPending, startTransition] = useTransition()

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const form = useForm<z.infer<typeof LoginSchema>>({
    resolver: zodResolver(LoginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const onSubmit = async (data: z.infer<typeof LoginSchema>) => {
    setError('')
    setSuccess('')
    // const login = async (email: string, password: string) => {
    //   const validatedData = LoginSchema.safeParse(data)
    //   if (!validatedData.success) {
    //     setError('Invalid Credentials')
    //     return { error: 'Invalid Credentials' }
    //   }

    //   const response = await fetch('/api/auth/login', {
    //     method: 'POST',
    //     headers: {
    //       'Content-Type': 'application/json',
    //     },
    //     body: JSON.stringify({ email, password }),
    //   })
    //   const resData = await response.json()
    //   console.log(resData)
    //   if (response.ok) {
    //     setSuccess('Login successful')
    //     return response.json()
    //   } else {
    //     setError('invalid credentials')
    //     return { error: 'invalid credentials' }
    //   }
    // }

    startTransition(() => {
      login(data).then((data) => {
        console.log("Data Error -----",data)
        if(data?.error){
          setError(data.error)
        }
        if(data?.success){
          setSuccess(data?.success)
        }
      }
      )
    })
  }
  return (
    <CardWrapper
      headerLabel='Welcome Back'
      backButtonLabel='Dont have an account?'
      backButtonHref='/auth/register'
      showSocials
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
          <div className='space-y-4'>
            <FormField
              control={form.control}
              name='email'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled={isPending}
                      placeholder='john.doe@example.de'
                      type='email'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='password'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Passwort</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={isPending} placeholder='********' type='password' />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormError message={error || urlError} />
          <FormSuccess message={success} />
          <Button type='submit' disabled={isPending} className='w-full'>
            Sign in
          </Button>
        </form>
      </Form>
    </CardWrapper>
  )
}
