import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  console.log('Callback route called')
  console.log('Request URL:', requestUrl.toString())
  console.log('Request origin:', requestUrl.origin)
  console.log('Has code:', !!code)

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('Error exchanging code for session:', error)
      return NextResponse.redirect(`${requestUrl.origin}?error=auth_error`)
    }
    console.log('Successfully exchanged code for session')
  }

  // URL to redirect to after sign in process completes
  const redirectUrl = requestUrl.origin
  console.log('Redirecting to:', redirectUrl)
  return NextResponse.redirect(redirectUrl)
}

