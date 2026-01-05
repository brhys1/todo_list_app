import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

  // Create a server-side Supabase client for code exchange
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables')
    return NextResponse.redirect(
      `${origin}?error=auth_error&details=Server configuration error`
    )
  }

  // Create Supabase client with PKCE flow
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: 'pkce',
    },
  })

  // Exchange the authorization code for a session
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
  // The session will be available to the client-side Supabase client
  // Note: For proper cookie handling, consider using @supabase/ssr package
  return NextResponse.redirect(origin)
}

