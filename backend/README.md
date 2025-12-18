# Todo List App with SMS Webhooks

A todo list application that receives text messages via Twilio webhooks and uses AI to parse them into structured tasks.

## Features

- 📱 Receive SMS messages via Twilio webhooks
- 🤖 AI-powered task parsing using Google Gemini
- 💾 Store tasks in Supabase database
- ✅ Automatic confirmation messages

## Setup

### 1. Install Dependencies

```bash
uv sync
```

### 2. Configure Environment Variables

Make sure your `GOOGLE_API_KEY` is set in the environment or update it in `main.py`.

### 3. Run the Server

```bash
python main.py
```

The server will start on `http://0.0.0.0:5000` by default (or the port specified by the `PORT` environment variable).

### 4. Configure Twilio Webhook

1. **Deploy your app** to a publicly accessible URL (e.g., using ngrok for local testing, or deploy to Heroku, Railway, etc.)

   For local testing with ngrok:
   ```bash
   ngrok http 5000
   ```

2. **In your Twilio Console:**
   - Go to Phone Numbers → Manage → Active Numbers
   - Select your Twilio phone number
   - Under "Messaging", set the webhook URL to:
     ```
     https://your-domain.com/webhook/sms
     ```
   - Set the HTTP method to `POST`
   - Save the configuration

### 5. Test It

Send a text message to your Twilio number, for example:
- "Remind me to buy groceries tomorrow at 5pm"
- "Call mom next Friday"
- "Finish project report by Monday"

You'll receive a confirmation message with the parsed task details!

## Endpoints

- `POST /webhook/sms` - Receives SMS messages from Twilio
- `GET /health` - Health check endpoint

## Local Development with ngrok

1. Start the Flask app:
   ```bash
   python main.py
   ```

2. In another terminal, start ngrok:
   ```bash
   ngrok http 5000
   ```

3. Copy the HTTPS URL from ngrok (e.g., `https://abc123.ngrok.io`)

4. In Twilio, set the webhook URL to: `https://abc123.ngrok.io/webhook/sms`

Now you can test SMS messages locally!

