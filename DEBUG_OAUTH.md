# OAuth Redirect Debugging Guide

## Current Issue
Getting redirected to `0.0.0.0:8080` instead of the Cloud Run URL after Google sign-in.

## Debugging Steps

### 1. Verify Your Actual Frontend URL
```bash
gcloud run services describe todo-list-frontend \
  --region us-central1 \
  --format 'value(status.url)'
```

Your URL should be: `https://todo-list-frontend-338641326538.us-central1.run.app`

### 2. Check Browser Console & Network Tab

1. **Open Browser DevTools** (F12 or Cmd+Option+I)
2. **Go to Console tab** - Look for any errors
3. **Go to Network tab** - Filter by "auth" or "callback"
4. **Click "Sign in with Google"** again
5. **Watch the network requests**:
   - What URL does the OAuth redirect start from?
   - What URL does it try to redirect to?
   - What's the final redirect URL?

### 3. Check Supabase Dashboard Logs

1. Go to [Supabase Dashboard](https://app.supabase.com) → Your Project
2. Go to **Logs** → **Auth Logs**
3. Look for recent sign-in attempts
4. Check what redirect URLs are being used

### 4. Verify Current URL When Signing In

Before clicking "Sign in with Google", check:
- Are you accessing the site via the Cloud Run URL (`https://todo-list-frontend-338641326538.us-central1.run.app`)?
- Or are you accessing it via `localhost` or `0.0.0.0`?

**IMPORTANT**: You must access the site via the Cloud Run URL, not localhost!

### 5. Clear Browser Cache & Cookies

1. Clear browser cache
2. Clear cookies for the Cloud Run domain
3. Clear cookies for `*.supabase.co`
4. Try signing in again

### 6. Check Supabase Redirect URL Configuration Again

In Supabase Dashboard → Authentication → URL Configuration:

**Site URL** should be:
- `https://todo-list-frontend-338641326538.us-central1.run.app` (with or without trailing slash)

**Redirect URLs** should include:
- `https://todo-list-frontend-338641326538.us-central1.run.app/auth/callback`

**Remove any URLs containing:**
- `localhost`
- `0.0.0.0`
- `127.0.0.1`
- Any local development URLs

### 7. Test with Browser Console

Open browser console on your Cloud Run site and run:
```javascript
console.log('Current origin:', window.location.origin);
console.log('Current href:', window.location.href);
```

This should show your Cloud Run URL, not `0.0.0.0:8080`.

### 8. Check if There's a Redirect Loop

1. Open Network tab in DevTools
2. Enable "Preserve log"
3. Click "Sign in with Google"
4. Count how many redirects happen
5. Check the sequence of URLs

## Common Issues

### Issue 1: Accessing via Wrong URL
**Problem**: Accessing the site via `localhost` or `0.0.0.0:8080` instead of Cloud Run URL
**Solution**: Always access via `https://todo-list-frontend-338641326538.us-central1.run.app`

### Issue 2: Cached Redirect URL
**Problem**: Browser or Supabase has cached an old redirect URL
**Solution**: Clear cache/cookies, verify Supabase config

### Issue 3: Incorrect Site URL in Supabase
**Problem**: Site URL in Supabase doesn't match actual Cloud Run URL
**Solution**: Update Site URL in Supabase Dashboard

### Issue 4: Multiple Redirect URLs
**Problem**: Multiple redirect URLs configured, causing confusion
**Solution**: Only keep the Cloud Run callback URL, remove all others

## Next Steps

After trying these steps, check:
1. What URL shows in the browser address bar when you click "Sign in with Google"?
2. What URL does it redirect to after Google authentication?
3. What errors appear in the browser console?
4. What appears in Supabase Auth Logs?

Share these findings for further debugging.

