'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

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

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
  { value: 'America/Toronto', label: 'Eastern Time — Toronto' },
  { value: 'America/Vancouver', label: 'Pacific Time — Vancouver' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
]

const inputStyle = {
  background: '#111111',
  border: '1px solid #222222',
  color: '#ffffff',
}

const inputFocusStyle = {
  borderColor: '#7c3aed',
  outline: 'none',
}

function StyledInput({ type, value, onChange, placeholder, disabled, required, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      {...rest}
      style={{
        ...inputStyle,
        ...(focused ? inputFocusStyle : {}),
      }}
      className="w-full rounded-xl px-3.5 py-2.5 text-sm placeholder-zinc-600 transition-colors disabled:opacity-50"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  )
}

function StyledSelect({ value, onChange, children, disabled, required, id }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  const [focused, setFocused] = useState(false)
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={required}
        style={{
          ...inputStyle,
          ...(focused ? inputFocusStyle : {}),
          appearance: 'none',
          WebkitAppearance: 'none',
        }}
        className="w-full rounded-xl px-3.5 py-2.5 pr-9 text-sm cursor-pointer transition-colors disabled:opacity-50"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        {children}
      </select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
        <svg className="w-3.5 h-3.5" style={{ color: '#52525b' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: '#52525b' }}>
      {children}
    </label>
  )
}

export default function PhoneNumberSetup({ onDone }: { onDone?: () => void }) {
  const { user } = useAuth()
  const [countryCode, setCountryCode] = useState('+1')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [timezone, setTimezone] = useState('America/New_York')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [hasPhoneNumber, setHasPhoneNumber] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [smsOptIn, setSmsOptIn] = useState(false)
  const [phoneCopied, setPhoneCopied] = useState(false)

  const copyPhone = () => {
    navigator.clipboard.writeText('8559403326')
    setPhoneCopied(true)
    setTimeout(() => setPhoneCopied(false), 2000)
  }

  useEffect(() => {
    if (!user) { setChecking(false); return }

    async function checkPhoneNumber() {
      if (!user) return
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('phone_number, timezone, sms_opt_in')
          .eq('id', user.id)
          .single()

        if (error && error.code !== 'PGRST116') {
          console.error('Error checking phone number:', error)
          setChecking(false)
          return
        }

        if (data?.phone_number) {
          setHasPhoneNumber(true)
          const existingPhone = data.phone_number
          if (existingPhone.startsWith('+')) {
            const matched = COUNTRY_CODES.find(cc => existingPhone.startsWith(cc.code))
            if (matched) {
              setCountryCode(matched.code)
              setPhoneNumber(existingPhone.substring(matched.code.length))
            } else {
              setCountryCode('+1')
              setPhoneNumber(existingPhone.substring(1))
            }
          }
          if (data.timezone) setTimezone(data.timezone)
          if (data.sms_opt_in) setSmsOptIn(true)
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

    const cleaned = phoneNumber.trim().replace(/\s+/g, '')
    if (!cleaned) { setError('Please enter a phone number'); setLoading(false); return }
    if (!/^\d+$/.test(cleaned)) { setError('Phone number must contain only digits'); setLoading(false); return }

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .upsert(
          { id: user.id, phone_number: countryCode + cleaned, timezone, sms_opt_in: smsOptIn, updated_at: new Date().toISOString() },
          { onConflict: 'id' }
        )

      if (updateError) {
        console.error('Error updating:', updateError)
        setError('Failed to save. Please try again.')
        setLoading(false)
        return
      }

      setHasPhoneNumber(true)
      setIsEditing(false)
      onDone?.()
    } catch (err) {
      console.error('Error:', err)
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex items-center gap-1.5">
          {[0, 150, 300].map((delay) => (
            <div
              key={delay}
              className="w-1.5 h-1.5 rounded-full animate-bounce"
              style={{ background: '#3f3f46', animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
      </div>
    )
  }

  if (hasPhoneNumber && !isEditing) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div
          className="rounded-2xl p-8 w-full max-w-sm"
          style={{ background: '#0a0a0a', border: '1px solid #1c1c1c' }}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-6" style={{ background: '#4c1d95' }}>
            <svg className="w-4 h-4 text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-lg font-semibold text-white tracking-tight mb-1">
            You&apos;re all set
          </h1>
          <p className="text-sm mb-6" style={{ color: '#52525b' }}>
            Phone number saved to your profile.
          </p>

          <div className="rounded-xl p-4 mb-6" style={{ background: '#111111', border: '1px solid #1c1c1c' }}>
            <p className="text-xs mb-2 uppercase tracking-wider font-medium" style={{ color: '#3f3f46' }}>
              Text tasks to
            </p>
            <button
              onClick={copyPhone}
              className="flex items-center gap-2 w-full group transition-colors"
              title="Copy phone number"
            >
              <span className="text-base font-semibold text-white">(855) 940-3326</span>
              <span className="text-xs" style={{ color: '#52525b' }}>
                {phoneCopied ? '✓ copied' : 'tap to copy'}
              </span>
            </button>
            <p className="text-xs mt-2" style={{ color: '#3f3f46' }}>
              e.g. &quot;Buy milk tomorrow&quot; or &quot;Meeting at 3pm Friday&quot;
            </p>
          </div>

          <button
            onClick={() => onDone ? onDone() : window.location.reload()}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-colors mb-2"
            style={{ background: '#7c3aed' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#6d28d9' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#7c3aed' }}
          >
            Open Calendar
          </button>
          <button
            onClick={() => setIsEditing(true)}
            className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{ color: '#71717a', background: 'transparent' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#a1a1aa' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#71717a' }}
          >
            Edit Settings
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div
        className="rounded-2xl p-8 w-full max-w-sm"
        style={{ background: '#0a0a0a', border: '1px solid #1c1c1c' }}
      >
        <div className="mb-7">
          <h1 className="text-lg font-semibold text-white tracking-tight mb-1">
            {isEditing ? 'Settings' : 'Add your phone number'}
          </h1>
          <p className="text-sm" style={{ color: '#52525b' }}>
            {isEditing
              ? 'Update your contact info and preferences.'
              : 'Required to send tasks via SMS.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Phone Number</Label>
            <div className="flex gap-2">
              <div className="w-[140px] flex-shrink-0">
                <StyledSelect
                  id="countryCode"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  disabled={loading}
                  required
                >
                  {COUNTRY_CODES.map((cc) => (
                    <option key={cc.code} value={cc.code} style={{ background: '#111111' }}>
                      {cc.code} {cc.country}
                    </option>
                  ))}
                </StyledSelect>
              </div>
              <StyledInput
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d\s]/g, ''))}
                placeholder="1234567890"
                disabled={loading}
                required
              />
            </div>
          </div>

          <div>
            <Label>Timezone</Label>
            <StyledSelect
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={loading}
              required
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value} style={{ background: '#111111' }}>
                  {tz.label}
                </option>
              ))}
            </StyledSelect>
            <p className="mt-1.5 text-xs" style={{ color: '#3f3f46' }}>
              Used to interpret dates in your SMS tasks
            </p>
          </div>

          <div
            className="flex items-start gap-3 rounded-xl p-4 cursor-pointer"
            style={{ background: '#0f0f0f', border: '1px solid #1c1c1c' }}
            onClick={() => !loading && setSmsOptIn(!smsOptIn)}
          >
            <div
              className="mt-0.5 w-4 h-4 rounded flex-shrink-0 flex items-center justify-center transition-colors"
              style={{
                background: smsOptIn ? '#7c3aed' : 'transparent',
                border: `1px solid ${smsOptIn ? '#7c3aed' : '#333333'}`,
              }}
            >
              {smsOptIn && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-white leading-none mb-1">Daily SMS reminders</p>
              <p className="text-xs leading-relaxed" style={{ color: '#52525b' }}>
                Receive a daily text with your upcoming tasks. Msg & data rates may apply. Reply STOP to opt out.
              </p>
            </div>
          </div>

          {error && (
            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.25)', color: '#fb7185' }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: '#7c3aed' }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#6d28d9' }}
            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = '#7c3aed' }}
          >
            {loading ? 'Saving...' : isEditing ? 'Save Changes' : 'Save Phone Number'}
          </button>

          {isEditing && (
            <button
              type="button"
              onClick={() => { setIsEditing(false); onDone?.() }}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={{ color: '#71717a' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#a1a1aa' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#71717a' }}
            >
              Cancel
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
