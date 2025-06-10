'use client'
import { CardWrapper } from '@/components/auth/card-wrapper'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { RegisterSchema } from '@/schemas'
import { Input } from '@/components/ui/input'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { FormError  } from '@/components/form-error'
import { FormSuccess } from '@/components/form-success'
import { useTransition } from 'react'
import { useState } from 'react';
import { Tooltip } from '@geist-ui/core'

import {
  Form,
  FormControl,
  FormField,
  FormLabel,
  FormMessage,
  FormItem,
} from '@/components/ui/form'

export const RegisterForm = () => {

  const [isPending, startTransition] = useTransition()

  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const form = useForm<z.infer<typeof RegisterSchema>>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: {
      email: '',
      name: '',
      password: '',
    },
  })

  const onSubmit = async (data: z.infer<typeof RegisterSchema>) => {
    setError("")
    setSuccess("")
    const register = async (data: z.infer<typeof RegisterSchema>) => {
      const validatedData = RegisterSchema.safeParse(data)
      if (!validatedData.success) {
        setError('Invalid Inputs')
        return { error: 'Invalid invalid inputs' }
      }
      const { email, name, password } = validatedData.data

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ "email":email, "name":name, "password": password }),
      })
      const resData = await response.json()
      console.log(resData)
      if (response.ok) {
        setSuccess(resData.success)
        return resData
      } else {
        setError(resData.error)
        return resData
      }
    }

    startTransition(() => {
      const res = register(data)
    })
  }
  return (
      <CardWrapper
          headerLabel='Create an account'
          backButtonLabel='Already have an account?'
          backButtonHref='/auth/login'
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
                          name='name'
                          render={({ field }) => (
                              <FormItem>
                                  <FormLabel>Name</FormLabel>
                                  <FormControl>
                                      <Input
                                          {...field}
                                          disabled={isPending}
                                          placeholder='John Doe'
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
                                <Tooltip text="The Password must contain at least one number, one uppercase letter, one lowercase letter, and at least 6 characters">
                                  <FormLabel>Passwort </FormLabel>
                                </Tooltip>
                                  <FormControl>
                                      <Input
                                          {...field}
                                          disabled={isPending}
                                          placeholder='********'
                                          type='password'
                                      />
                                  </FormControl>
                                  <FormMessage />
                              </FormItem>
                          )}
                      />
                  </div>
                  <FormError message={error} />
                  <FormSuccess message={success} />
                  <Button type='submit' disabled={isPending} className='w-full'>
                      Sign up
                  </Button>
              </form>
          </Form>
      </CardWrapper>
  )
}
