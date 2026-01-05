# GCP Cloud Run Deployment Guide

This guide walks you through deploying the Todo List App to Google Cloud Platform using Cloud Run and GitHub Actions.

## Prerequisites

- Google Cloud Platform account with billing enabled
- GitHub repository with the code
- Supabase project (already set up)
- Google Cloud SDK (gcloud) installed locally (optional, for testing)

## Step 1: GCP Project Setup

1. **Create a GCP Project**
   ```bash
   gcloud projects create YOUR_PROJECT_ID --name="Todo List App"
   gcloud config set project YOUR_PROJECT_ID
   ```

2. **Enable Required APIs**
   ```bash
   gcloud services enable \
     cloudbuild.googleapis.com \
     run.googleapis.com \
     artifactregistry.googleapis.com \
     containerregistry.googleapis.com
   ```

3. **Enable Billing** (if not already enabled)
   - Go to [GCP Console](https://console.cloud.google.com/)
   - Navigate to Billing and link your project

## Step 2: Create Service Account for GitHub Actions

1. **Create Service Account**
   ```bash
   gcloud iam service-accounts create github-actions \
     --display-name="GitHub Actions Service Account"
   ```

2. **Grant Required Permissions**
   ```bash
   PROJECT_ID=todo-list-483321
   SERVICE_ACCOUNT=github-actions@${PROJECT_ID}.iam.gserviceaccount.com

   gcloud projects add-iam-policy-binding ${PROJECT_ID} \
     --member="serviceAccount:${SERVICE_ACCOUNT}" \
     --role="roles/run.admin"

   gcloud projects add-iam-policy-binding ${PROJECT_ID} \
     --member="serviceAccount:${SERVICE_ACCOUNT}" \
     --role="roles/storage.admin"

   gcloud projects add-iam-policy-binding ${PROJECT_ID} \
     --member="serviceAccount:${SERVICE_ACCOUNT}" \
     --role="roles/iam.serviceAccountUser"
   ```

3. **Create and Download Service Account Key**
   ```bash
   gcloud iam service-accounts keys create key.json \
     --iam-account=${SERVICE_ACCOUNT}
   ```
key: 8503e6617a4c4ace23dbd8a297c61af7ac87ad09

4. **Copy the JSON key content** - you'll need this for GitHub Secrets

## Step 3: Create Artifact Registry Repository

```bash
gcloud artifacts repositories create cloud-run-source-deploy \
  --repository-format=docker \
  --location=us-central1 \
  --description="Docker repository for Cloud Run deployments"
```

## Step 4: Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions → New repository secret

Add the following secrets:

### Required Secrets

1. **GCP_PROJECT_ID**
   - Value: Your GCP project ID (e.g., `my-todo-app-123456`)

2. **GCP_SERVICE_ACCOUNT_KEY**
   - Value: The entire contents of the `key.json` file created in Step 2
   - Format: Copy the entire JSON object including `{ }`

3. **NEXT_PUBLIC_SUPABASE_URL**
   - Value: Your Supabase project URL (e.g., `https://xxxxx.supabase.co`)

4. **NEXT_PUBLIC_SUPABASE_ANON_KEY**
   - Value: Your Supabase anon/public key
   - Found in: Supabase Dashboard → Settings → API

5. **SUPABASE_URL**
   - Value: Your Supabase project URL (same as NEXT_PUBLIC_SUPABASE_URL)

6. **SUPABASE_SERVICE_ROLE_KEY**
   - Value: Your Supabase service_role key (keep this secret!)
   - Found in: Supabase Dashboard → Settings → API → service_role key

7. **GOOGLE_API_KEY**
   - Value: Your Google Gemini API key
   - Found in: Google AI Studio or Google Cloud Console

### Optional Secrets (if using Twilio)

If your backend uses Twilio webhooks, you may need additional Twilio-related secrets. Check your backend code for specific Twilio environment variables.

## Step 5: Update Frontend Environment Configuration

The frontend uses environment variables that start with `NEXT_PUBLIC_`. These are set via Cloud Run environment variables in the GitHub Actions workflow.

Make sure your `frontend/lib/supabase.ts` uses:
```typescript
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
```

## Step 6: Configure OAuth Redirect URLs

1. **Update Supabase OAuth Redirect URLs**
   - Go to Supabase Dashboard → Authentication → URL Configuration
   - Add your Cloud Run frontend URL: `https://todo-list-frontend-XXXXX-uc.a.run.app/auth/callback`
   - Also add: `https://YOUR_DOMAIN/auth/callback` if using a custom domain

2. **Update Google OAuth (if using Google Sign-In)**
   - Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
   - Edit your OAuth 2.0 Client ID
   - Add authorized redirect URI: `https://YOUR_FRONTEND_URL/auth/callback`

## Step 7: Deploy

### Automatic Deployment

Once you've set up all secrets, push to the `main` branch:

```bash
git add .
git commit -m "Deploy to Cloud Run"
git push origin main
```

The GitHub Actions workflows will automatically:
1. Build Docker images for frontend and backend
2. Push images to Artifact Registry
3. Deploy to Cloud Run

### Manual Deployment (Testing)

You can also deploy manually using gcloud:

**Frontend:**
```bash
cd frontend
gcloud run deploy todo-list-frontend \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars NEXT_PUBLIC_SUPABASE_URL="YOUR_URL" \
  --set-env-vars NEXT_PUBLIC_SUPABASE_ANON_KEY="YOUR_KEY"
```

**Backend:**
```bash
cd backend
gcloud run deploy todo-list-backend \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_API_KEY="YOUR_KEY" \
  --set-env-vars SUPABASE_URL="YOUR_URL" \
  --set-env-vars SUPABASE_SERVICE_ROLE_KEY="YOUR_KEY"
```

## Step 8: Get Service URLs

After deployment, get your service URLs:

```bash
# Frontend URL
gcloud run services describe todo-list-frontend \
  --region us-central1 \
  --format 'value(status.url)'

# Backend URL
gcloud run services describe todo-list-backend \
  --region us-central1 \
  --format 'value(status.url)'
```

Or check in the GCP Console → Cloud Run → Services

## Step 9: Update Twilio Webhook (if applicable)

If you're using Twilio for SMS:

1. Get your backend Cloud Run URL
2. Update Twilio webhook URL to: `https://YOUR_BACKEND_URL/webhook/sms`

## Step 10: Test the Deployment

1. Visit your frontend URL
2. Sign in with Google OAuth
3. Add your phone number
4. Test creating tasks
5. Test SMS webhook (if configured)

## Troubleshooting

### Common Issues

1. **Build failures**
   - Check GitHub Actions logs
   - Verify all dependencies are in `package.json` (frontend) or `pyproject.toml` (backend)

2. **Runtime errors**
   - Check Cloud Run logs: `gcloud run services logs read SERVICE_NAME --region us-central1`
   - Verify all environment variables are set correctly

3. **Authentication errors**
   - Verify service account has correct permissions
   - Check GCP_SERVICE_ACCOUNT_KEY secret format (must be valid JSON)

4. **OAuth redirect errors**
   - Ensure redirect URLs are configured in both Supabase and Google Cloud Console
   - Check that the callback URL matches exactly

5. **Environment variable issues**
   - Verify all required secrets are set in GitHub
   - Check that NEXT_PUBLIC_ variables are set for frontend
   - Ensure backend has all required environment variables

### Viewing Logs

```bash
# Frontend logs
gcloud run services logs read todo-list-frontend --region us-central1 --limit 50

# Backend logs
gcloud run services logs read todo-list-backend --region us-central1 --limit 50
```

### Cost Considerations

- Cloud Run charges based on:
  - Request count
  - CPU and memory allocation
  - Request duration
  - Minimum instances (if configured)
- Free tier includes: 2 million requests/month, 360,000 GB-seconds, 180,000 vCPU-seconds
- Estimated cost for small usage: $0-5/month

## Next Steps

- Set up custom domain (optional)
- Configure Cloud CDN for frontend (optional)
- Set up monitoring and alerts
- Configure backup strategies
- Set up staging environment

## Support

For issues or questions:
- Check Cloud Run logs
- Review GitHub Actions workflow logs
- Consult GCP documentation: https://cloud.google.com/run/docs

