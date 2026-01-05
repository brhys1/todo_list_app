'use client'

import { useAuth } from '@/lib/auth-context'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import TaskCalendar from '@/components/TaskCalendar'
import LoginScreen from '@/components/LoginScreen'
import PhoneNumberSetup from '@/components/PhoneNumberSetup'

export default function Home() {
  const { user, loading } = useAuth()
  const [hasPhoneNumber, setHasPhoneNumber] = useState<boolean | null>(null)
  const [checkingPhone, setCheckingPhone] = useState(true)

  // Check if user has phone number
  useEffect(() => {
    if (!user) {
      setHasPhoneNumber(null)
      setCheckingPhone(false)
      return
    }

    async function checkPhoneNumber() {
      if (!user) return
      
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('phone_number')
          .eq('id', user.id)
          .single()

        if (error && error.code !== 'PGRST116') {
          // PGRST116 = no rows returned
          console.error('Error checking phone number:', error)
          setHasPhoneNumber(false)
          setCheckingPhone(false)
          return
        }

        setHasPhoneNumber(!!data?.phone_number)
      } catch (err) {
        console.error('Error:', err)
        setHasPhoneNumber(false)
      } finally {
        setCheckingPhone(false)
      }
    }

    checkPhoneNumber()
  }, [user])

  if (loading || checkingPhone) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return <LoginScreen />
  }

  // Show phone number setup if user doesn't have a phone number
  if (hasPhoneNumber === false) {
    return <PhoneNumberSetup />
  }

  return <TaskCalendar />
}
