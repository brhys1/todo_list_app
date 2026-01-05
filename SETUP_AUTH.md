# Authentication Setup Guide

This guide will help you set up Google OAuth authentication and user management for the Task Calendar app.

## Prerequisites

1. Supabase project with database set up
2. Google OAuth credentials
3. Database migration run

## Step 1: Run Database Migration

1. Go to your Supabase dashboard → SQL Editor
2. Copy and run the contents of `migrations/001_add_user_support.sql`
3. This will:
   - Create a `profiles` table to store phone numbers
   - Add `user_id` column to the `tasks` table
   - Set up Row Level Security (RLS) policies
   - Create a trigger to auto-create profiles on user signup

## Step 2: Enable Google OAuth in Supabase

1. Go to Supabase Dashboard → Authentication → Providers
2. Enable Google provider
3. Add your Google OAuth Client ID and Client Secret
   - To get these, go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create OAuth 2.0 credentials
   - Add authorized redirect URIs:
     - `https://<your-project-ref>.supabase.co/auth/v1/callback`
     - `http://localhost:3000/auth/callback` (for local development)
4. Save the settings4

## Step 3: Update Redirect URLs

1. In Supabase Dashboard → Authentication → URL Configuration
2. Add your site URL:
   - Local: `http://localhost:3000`
   - Production: Your production URL
3. Add redirect URL: `http://localhost:3000/auth/callback` (and production URL)

## Step 4: User Phone Number Setup

Users need to add their phone number to their profile after signing up. You can do this by:

1. Going to the Supabase Dashboard → Table Editor → `profiles` table
2. Manually adding phone numbers for existing users
3. Or creating a UI component in the app to let users update their phone number

The phone number should match the format that Twilio sends (e.g., `+1234567890`)

## Step 5: Test the Flow

1. Sign in with Google on the web app
2. Add your phone number to your profile in the database
3. Send an SMS to your Twilio number
4. The task should appear in your calendar

## Notes

- The backend looks up users by phone number in the `profiles` table
- Phone number matching is flexible - it tries variations with/without `+` prefix
- If a user sends an SMS but doesn't have a profile with that phone number, they'll get an error message
- Tasks are automatically filtered by `user_id` using RLS policies

