import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  // Get the correct origin from the Host header (Cloud Run provides this)
  const host = request.headers.get('host') || request.headers.get('x-forwarded-host')
  const protocol = request.headers.get('x-forwarded-proto') || 'https'
  const origin = `${protocol}://${host}`
  
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')

  console.log('Callback route called')
  console.log('Request URL:', request.url)
  console.log('Host header:', host)
  console.log('Protocol:', protocol)
  console.log('Computed origin:', origin)
  console.log('Has code:', !!code)
  console.log('Has error:', !!error)

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error, errorDescription)
    return NextResponse.redirect(
      `${origin}?error=auth_error&details=${encodeURIComponent(errorDescription || error)}`
    )
  }

  // PKCE flow requires a code parameter
  if (!code) {
    console.error('No authorization code found in callback URL')
    return NextResponse.redirect(
      `${origin}?error=auth_error&details=No authorization code received`
    )
  }

  // Create server-side Supabase client with cookie support
  // This will read the PKCE code verifier from cookies
  const supabase = await createClient()

  // Exchange the authorization code for a session
  // The code verifier will be read from cookies automatically
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError) {
    console.error('Error exchanging code for session:', exchangeError)
    return NextResponse.redirect(
      `${origin}?error=auth_error&message=${encodeURIComponent(exchangeError.message)}`
    )
  }

  if (!data.session) {
    console.error('No session returned from code exchange')
    return NextResponse.redirect(
      `${origin}?error=auth_error&details=Failed to create session`
    )
  }

  console.log('Successfully exchanged code for session')
  console.log('User ID:', data.session.user.id)

  // Redirect to home
  // The session cookies are automatically set by @supabase/ssr
  return NextResponse.redirect(origin)
}

