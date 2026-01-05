'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

// Common country codes
const COUNTRY_CODES = [
  { code: '+1', country: 'US/Canada' },
  { code: '+44', country: 'UK' },
  { code: '+61', country: 'Australia' },
  { code: '+49', country: 'Germany' },
  { code: '+33', country: 'France' },
  { code: '+39', country: 'Italy' },
  { code: '+34', country: 'Spain' },
  { code: '+31', country: 'Netherlands' },
  { code: '+46', country: 'Sweden' },
  { code: '+47', country: 'Norway' },
  { code: '+45', country: 'Denmark' },
  { code: '+41', country: 'Switzerland' },
  { code: '+32', country: 'Belgium' },
  { code: '+351', country: 'Portugal' },
  { code: '+353', country: 'Ireland' },
  { code: '+358', country: 'Finland' },
  { code: '+81', country: 'Japan' },
  { code: '+82', country: 'South Korea' },
  { code: '+86', country: 'China' },
  { code: '+91', country: 'India' },
  { code: '+52', country: 'Mexico' },
  { code: '+55', country: 'Brazil' },
  { code: '+54', country: 'Argentina' },
  { code: '+27', country: 'South Africa' },
  { code: '+7', country: 'Russia' },
  { code: '+971', country: 'UAE' },
  { code: '+65', country: 'Singapore' },
  { code: '+60', country: 'Malaysia' },
  { code: '+66', country: 'Thailand' },
  { code: '+84', country: 'Vietnam' },
]

// Common timezones
const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
  { value: 'America/Toronto', label: 'Eastern Time - Toronto' },
  { value: 'America/Vancouver', label: 'Pacific Time - Vancouver' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
]

export default function PhoneNumberSetup() {
  const { user } = useAuth()
  const [countryCode, setCountryCode] = useState('+1')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [timezone, setTimezone] = useState('America/New_York') // Default to Eastern Time
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [hasPhoneNumber, setHasPhoneNumber] = useState(false)

  // Check if user already has a phone number
  useEffect(() => {
    if (!user) {
      setChecking(false)
      return
    }

    async function checkPhoneNumber() {
      if (!user) return
      
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('phone_number, timezone')
          .eq('id', user.id)
          .single()

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
          console.error('Error checking phone number:', error)
          setChecking(false)
          return
        }

        if (data?.phone_number) {
          setHasPhoneNumber(true)
          const existingPhone = data.phone_number
          if (existingPhone.startsWith('+')) {
            const matchedCode = COUNTRY_CODES.find(cc => existingPhone.startsWith(cc.code))
            if (matchedCode) {
              setCountryCode(matchedCode.code)
              setPhoneNumber(existingPhone.substring(matchedCode.code.length))
            } else {
              setCountryCode('+1')
              setPhoneNumber(existingPhone.substring(1))
            }
          }
          // Set timezone if it exists, otherwise keep default
          if (data.timezone) {
            setTimezone(data.timezone)
          }
        }
      } catch (err) {
        console.error('Error:', err)
      } finally {
        setChecking(false)
      }
    }

    checkPhoneNumber()
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setLoading(true)
    setError(null)

    const cleanedNumber = phoneNumber.trim().replace(/\s+/g, '')
    if (!cleanedNumber) {
      setError('Please enter a phone number')
      setLoading(false)
      return
    }

    if (!/^\d+$/.test(cleanedNumber)) {
      setError('Phone number must contain only digits')
      setLoading(false)
      return
    }

    const formattedPhone = countryCode + cleanedNumber

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: user.id,
            phone_number: formattedPhone,
            timezone: timezone,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'id',
          }
        )

      if (updateError) {
        console.error('Error updating phone number:', updateError)
        setError('Failed to save phone number. Please try again.')
        setLoading(false)
        return
      }

      setHasPhoneNumber(true)
      // Don't reload - let the success message display
    } catch (err) {
      console.error('Error:', err)
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-gray-400">Checking...</p>
      </div>
    )
  }

  if (hasPhoneNumber) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-gray-900 rounded-xl shadow-2xl p-8 border border-gray-800 max-w-md w-full">
          <div className="text-center">
            <div className="mb-4">
              <svg className="w-16 h-16 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2 text-white">
              Phone Number Saved!
            </h1>
            <p className="text-gray-400 mb-6">
              Your phone number has been added to your profile.
            </p>
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-6">
              <p className="text-sm text-gray-400 mb-2">Text your tasks to:</p>
              <p className="text-xl font-semibold text-white">(484) 939-6264</p>
              <p className="text-xs text-gray-500 mt-2">
                Send a message like "Buy milk tomorrow" or "Meeting at 3pm Friday"
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              Continue to Calendar
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-xl shadow-2xl p-8 border border-gray-800 max-w-md w-full">
        <h1 className="text-3xl font-bold mb-2 text-white text-center">
          Phone Number Required
        </h1>
        <p className="text-gray-400 text-center mb-8">
          To use SMS features, please add your phone number to your profile.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-300 mb-2">
              Phone Number
            </label>
            <div className="flex gap-2">
              {/* Country Code Selector */}
              <div className="relative">
                <select
                  id="countryCode"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-3 pr-8 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none cursor-pointer min-w-[140px]"
                  disabled={loading}
                  required
                >
                  {COUNTRY_CODES.map((cc) => (
                    <option key={cc.code} value={cc.code} className="bg-gray-800">
                      {cc.code} {cc.country}
                    </option>
                  ))}
                </select>
                {/* Custom dropdown arrow */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              
              {/* Phone Number Input */}
              <input
                type="tel"
                id="phone"
                value={phoneNumber}
                onChange={(e) => {
                  // Only allow digits and spaces
                  const value = e.target.value.replace(/[^\d\s]/g, '')
                  setPhoneNumber(value)
                }}
                placeholder="1234567890"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
                required
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Select your country code and enter your phone number
            </p>
          </div>

          <div>
            <label htmlFor="timezone" className="block text-sm font-medium text-gray-300 mb-2">
              Timezone
            </label>
            <select
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none cursor-pointer"
              disabled={loading}
              required
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value} className="bg-gray-800">
                  {tz.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-gray-500">
              Your timezone is used to calculate dates for tasks (default: Eastern Time)
            </p>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-500 text-red-200 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            {loading ? 'Saving...' : 'Save Phone Number'}
          </button>
        </form>
      </div>
    </div>
  )
}

