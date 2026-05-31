import os
from dotenv import load_dotenv
import datetime
from datetime import timezone
from zoneinfo import ZoneInfo
from google import genai
from google.genai import types
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleAuthRequest
from googleapiclient.discovery import build
from supabase import create_client, Client
from pydantic import BaseModel, Field
from typing import Optional
from flask import Flask, request, Response, redirect
from flask_cors import CORS
from twilio.twiml.messaging_response import MessagingResponse

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Google Calendar OAuth config
GCAL_CLIENT_ID = os.getenv("GOOGLE_CALENDAR_CLIENT_ID")
GCAL_CLIENT_SECRET = os.getenv("GOOGLE_CALENDAR_CLIENT_SECRET")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:5000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
GCAL_SCOPES = ["https://www.googleapis.com/auth/calendar"]
GCAL_REDIRECT_URI = f"{BACKEND_URL}/auth/google/calendar/callback"

# Initialize clients (will fail gracefully if env vars are missing)
supabase = None
genai_client = None
try:
    if GOOGLE_API_KEY:
        genai_client = genai.Client(api_key=GOOGLE_API_KEY)
        print("Google AI configured successfully")
    else:
        print("Warning: GOOGLE_API_KEY not found. AI features may not work.")

    if SUPABASE_URL and SUPABASE_KEY:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("Supabase client initialized successfully")
    else:
        print("Warning: Supabase credentials not found. Some features may not work.")
except Exception as e:
    print(f"Error initializing clients: {e}")
    import traceback
    traceback.print_exc()
    supabase = None

app = Flask(__name__)
CORS(app, origins=[FRONTEND_URL])

class TaskSchema(BaseModel):
    task_name: str = Field(description="The core action item (e.g., 'Buy Milk').")
    due_date: str = Field(description="The due date in YYYY-MM-DD format. Calculate this based on today's date.")
    due_time: Optional[str] = Field(description="The time in 24-hour HH:MM format if mentioned (e.g. 17:00).")
    priority: str = Field(description="Priority level: 'High', 'Medium', or 'Low'.")
    category: str = Field(description="A single word tag like 'Work', 'Personal', 'Health'.")

class SmsAction(BaseModel):
    action: str = Field(description="The intent: 'create' to add new tasks, 'complete' to mark a task done, 'update' to change a task's date or time.")
    tasks: list[TaskSchema] = Field(description="For 'create': all tasks to add. Empty list for 'complete' and 'update'.")
    task_name_hint: Optional[str] = Field(description="For 'complete' and 'update': the name of the existing task being referenced.")
    new_due_date: Optional[str] = Field(description="For 'update': the new date in YYYY-MM-DD format. Null if date is not changing.")
    new_due_time: Optional[str] = Field(description="For 'update': the new time in HH:MM 24-hour format. Null if time is not changing.")

def get_user_timezone(user_id: str) -> str:
    if not supabase:
        return "America/New_York"
    try:
        response = supabase.table("profiles").select("timezone").eq("id", user_id).execute()
        if response.data and len(response.data) > 0 and response.data[0].get("timezone"):
            return response.data[0]["timezone"]
    except Exception as e:
        print(f"Error fetching user timezone: {e}")
    return "America/New_York"

def parse_sms_action(user_text: str, user_id: str) -> Optional[SmsAction]:
    user_tz = get_user_timezone(user_id)

    try:
        tz = ZoneInfo(user_tz)
    except Exception as e:
        print(f"Invalid timezone {user_tz}, defaulting to America/New_York: {e}")
        tz = ZoneInfo("America/New_York")

    today = datetime.datetime.now(tz).date()
    day_name = today.strftime("%A")
    full_date = today.strftime("%Y-%m-%d")

    # Fetch user's existing incomplete tasks for update/complete context
    existing_tasks_str = "None"
    if supabase:
        try:
            resp = supabase.table("tasks").select("task_name, due_date").eq("user_id", user_id).eq("completed", False).execute()
            if resp.data:
                existing_tasks_str = "\n".join(
                    f"- {t['task_name']} (due {t['due_date']})" for t in resp.data
                )
        except Exception as e:
            print(f"Error fetching existing tasks: {e}")

    prompt = f"""
    You are a personal scheduling assistant.
    CURRENT DATE: {day_name}, {full_date}.

    User's existing incomplete tasks:
    {existing_tasks_str}

    User Input: "{user_text}"

    Determine the intent and respond:

    If CREATING new tasks (action = "create"):
    - Populate tasks list with all tasks mentioned. Leave task_name_hint, new_due_date, new_due_time null.
    - The user may describe multiple tasks in one message — extract ALL of them.

    If COMPLETING/MARKING DONE a task (action = "complete"):
    - Set task_name_hint to the matching task name from the existing tasks list.
    - Leave tasks empty, new_due_date and new_due_time null.

    If UPDATING a task's date or time (action = "update"):
    - Set task_name_hint to the matching task name from the existing tasks list.
    - Set new_due_date if the date is changing (YYYY-MM-DD format), else null.
    - Set new_due_time if the time is changing (HH:MM 24-hour format), else null.
    - Leave tasks empty.

    General rules:
    - Calculate relative dates like "tomorrow" or "next friday" based on CURRENT DATE.
    - If no time is specified, leave due_time null.
    """

    try:
        response = genai_client.models.generate_content(
            model="gemini-3.1-flash-lite",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=SmsAction,
            ),
        )
        return SmsAction.model_validate_json(response.text)
    except Exception as e:
        print(f"Error parsing SMS action: {e}")
        return None

def find_matching_task(user_id: str, task_name_hint: str):
    if not supabase or not task_name_hint:
        return None
    try:
        resp = supabase.table("tasks").select("*").eq("user_id", user_id).eq("completed", False).execute()
        if not resp.data:
            return None
        hint = task_name_hint.lower()
        # Substring match in either direction
        for task in resp.data:
            name = task["task_name"].lower()
            if hint in name or name in hint:
                return task
        # Word-overlap fallback
        hint_words = set(hint.split())
        best, best_score = None, 0
        for task in resp.data:
            score = len(hint_words & set(task["task_name"].lower().split()))
            if score > best_score:
                best_score, best = score, task
        return best
    except Exception as e:
        print(f"Error finding matching task: {e}")
        return None

def get_user_by_phone_number(phone_number: str):
    if not supabase:
        print("Supabase client not initialized")
        return None
    try:
        cleaned_phone = ''.join(filter(str.isdigit, phone_number))
        phone_variations = [cleaned_phone, f"+{cleaned_phone}", phone_number]

        for phone in phone_variations:
            response = supabase.table("profiles").select("id").eq("phone_number", phone).execute()
            if response.data and len(response.data) > 0:
                user_id = response.data[0]["id"]
                print(f"Found user {user_id} for phone {phone}")
                return user_id

        print(f"No user found for phone number: {phone_number}")
        return None
    except Exception as e:
        print(f"Error looking up user by phone: {e}")
        return None

def save_to_supabase(task_data: TaskSchema, user_id: str):
    if not supabase:
        print("Supabase client not initialized")
        return None
    try:
        data_payload = task_data.model_dump()
        data_payload["user_id"] = user_id

        response = supabase.table("tasks").insert(data_payload).execute()

        if response.data:
            print(f"Saved to DB: {task_data.task_name} ({task_data.due_date}) for user {user_id}")
            return response.data
        else:
            print("Database insert returned empty response.")
            return None

    except Exception as e:
        print(f"Database Error: {e}")
        return None

def sms_reply(text: str) -> Response:
    resp = MessagingResponse()
    resp.message(text)
    return Response(str(resp), mimetype='text/xml'), 200

@app.route('/webhook/sms', methods=['POST'])
def sms_webhook():
    incoming_message = request.form.get('Body', '').strip()
    from_number = request.form.get('From', '')

    print(f"Received SMS from {from_number}: '{incoming_message}'")

    if not incoming_message:
        return sms_reply("I didn't receive any message. Please try again!")

    user_id = get_user_by_phone_number(from_number)
    if not user_id:
        return sms_reply("❌ No account found for this phone number. Please sign up at the web app first and add your phone number.")

    action = parse_sms_action(incoming_message, user_id)
    if not action:
        return sms_reply("I couldn't understand that. Please try rephrasing!")

    if action.action == "complete":
        task = find_matching_task(user_id, action.task_name_hint or "")
        if not task:
            return sms_reply("❌ Couldn't find that task. Try using the task name.")
        supabase.table("tasks").update({"completed": True}).eq("id", task["id"]).execute()
        delete_gcal_event(user_id, task.get("gcal_event_id"))
        return sms_reply(f"✅ Marked done: {task['task_name']}")

    elif action.action == "update":
        task = find_matching_task(user_id, action.task_name_hint or "")
        if not task:
            return sms_reply("❌ Couldn't find that task. Try using the task name.")
        updates = {}
        if action.new_due_date:
            updates["due_date"] = action.new_due_date
        if action.new_due_time:
            updates["due_time"] = action.new_due_time
        if not updates:
            return sms_reply("❌ I didn't catch what to update. Please include a new date or time.")
        supabase.table("tasks").update(updates).eq("id", task["id"]).execute()
        # Sync updated date/time to GCal
        from types import SimpleNamespace
        updated_task = SimpleNamespace(
            task_name=task["task_name"],
            due_date=updates.get("due_date", task["due_date"]),
            due_time=updates.get("due_time", task.get("due_time")),
            priority=task.get("priority", "Medium"),
            category=task.get("category", ""),
        )
        sync_task_to_gcal(updated_task, user_id, task.get("gcal_event_id"))
        new_date = updates.get("due_date", task["due_date"])
        new_time = updates.get("due_time", task.get("due_time"))
        reply = f"✅ Updated: {task['task_name']} → {new_date}"
        if new_time:
            reply += f" at {new_time}"
        return sms_reply(reply)

    else:  # "create"
        if not action.tasks:
            return sms_reply("I couldn't understand that task. Please try rephrasing it!")

        saved = []
        for task in action.tasks:
            print(f"🤖 AI Parsed: {task.task_name}")
            result = save_to_supabase(task, user_id)
            if result:
                saved.append(task)
                # Sync to GCal and store the event ID back on the task
                task_id = result[0]["id"]
                gcal_event_id = sync_task_to_gcal(task, user_id)
                if gcal_event_id:
                    supabase.table("tasks").update({"gcal_event_id": gcal_event_id}).eq("id", task_id).execute()

        if not saved:
            return sms_reply("Failed to save task to database. Please try again.")

        if len(saved) == 1:
            task = saved[0]
            reply = (
                f"✅ Task added: {task.task_name}\n"
                f"📅 Due: {task.due_date}"
                + (f" at {task.due_time}" if task.due_time else "")
                + f"\n🏷️ Category: {task.category}\n"
                f"⚡ Priority: {task.priority}"
            )
        else:
            lines = [f"✅ {len(saved)} tasks added:"]
            for task in saved:
                due = task.due_date + (f" at {task.due_time}" if task.due_time else "")
                lines.append(f"• {task.task_name} ({due})")
            reply = "\n".join(lines)

        return sms_reply(reply)



def get_gcal_service(user_id: str):
    """Build an authenticated Google Calendar service for a user, refreshing token if needed."""
    if not supabase or not GCAL_CLIENT_ID and GCAL_CLIENT_SECRET:
        return None
    try:
        resp = supabase.table("profiles").select(
            "gcal_access_token, gcal_refresh_token, gcal_token_expiry"
        ).eq("id", user_id).single().execute()
        data = resp.data
        if not data or not data.get("gcal_refresh_token"):
            return None

        creds = Credentials(
            token=data["gcal_access_token"],
            refresh_token=data["gcal_refresh_token"],
            token_uri="https://oauth2.googleapis.com/token",
            client_id=GCAL_CLIENT_ID,
            client_secret=GCAL_CLIENT_SECRET,
        )

        if not creds.valid:
            creds.refresh(GoogleAuthRequest())
            supabase.table("profiles").update({
                "gcal_access_token": creds.token,
                "gcal_token_expiry": creds.expiry.isoformat() if creds.expiry else None,
            }).eq("id", user_id).execute()

        return build("calendar", "v3", credentials=creds)
    except Exception as e:
        print(f"Error building GCal service for {user_id}: {e}")
        return None


def sync_task_to_gcal(task_data, user_id: str, gcal_event_id: str = None) -> Optional[str]:
    """Push a task to Google Tasks. Returns the task id."""
    service = get_gcal_service(user_id)
    if not service:
        return gcal_event_id  # user not connected, no-op

    user_tz = get_user_timezone(user_id)

    if task_data.due_time:
        start_dt = f"{task_data.due_date}T{task_data.due_time}:00"
        start = datetime.datetime.fromisoformat(start_dt)
        end = (start + datetime.timedelta(hours=0.25)).isoformat()
        start_obj = {"dateTime": start_dt, "timeZone": user_tz}
        end_obj = {"dateTime": end, "timeZone": user_tz}
    else:
        start_obj = {"date": task_data.due_date}
        end_obj = {"date": task_data.due_date}

    event_body = {
        "summary": task_data.task_name,
        "description": f"Priority: {task_data.priority}\nCategory: {task_data.category}",
        "start": start_obj,
        "end": end_obj,
    }

    try:
        if gcal_event_id:
            try:
                result = service.events().update(
                    calendarId="primary", eventId=gcal_event_id, body=event_body
                ).execute()
                return result.get("id")
            except Exception:
                # Event not found (e.g. stale ID from a previous API) — insert fresh
                pass
        result = service.events().insert(calendarId="primary", body=event_body).execute()
        return result.get("id")
    except Exception as e:
        print(f"Error syncing task to GCal: {e}")
        return gcal_event_id


def delete_gcal_event(user_id: str, gcal_event_id: str):
    """Delete a GCal event when a task is completed."""
    if not gcal_event_id:
        return
    service = get_gcal_service(user_id)
    if not service:
        return
    try:
        service.events().delete(calendarId="primary", eventId=gcal_event_id).execute()
    except Exception as e:
        print(f"Error deleting GCal event {gcal_event_id}: {e}")


@app.route('/auth/google/calendar', methods=['GET'])
def gcal_auth():
    """Return the Google OAuth URL for Calendar access."""
    user_id = request.args.get("user_id")
    if not user_id or not (GCAL_CLIENT_ID and GCAL_CLIENT_SECRET):
        return {"error": "Missing user_id or client secret not configured"}, 400

    from requests_oauthlib import OAuth2Session
    oauth = OAuth2Session(GCAL_CLIENT_ID, redirect_uri=GCAL_REDIRECT_URI, scope=GCAL_SCOPES)
    auth_url, _ = oauth.authorization_url(
        "https://accounts.google.com/o/oauth2/auth",
        access_type="offline",
        prompt="consent",
        state=user_id,
    )
    return {"url": auth_url}


@app.route('/auth/google/calendar/callback', methods=['GET'])
def gcal_callback():
    """Handle Google OAuth callback, store tokens, redirect to frontend."""
    import requests as http_requests
    code = request.args.get("code")
    user_id = request.args.get("state")
    if not code or not user_id or not (GCAL_CLIENT_ID and GCAL_CLIENT_SECRET):
        return "Missing code or state", 400

    try:
        resp = http_requests.post("https://oauth2.googleapis.com/token", data={
            "client_id": GCAL_CLIENT_ID,
            "client_secret": GCAL_CLIENT_SECRET,
            "redirect_uri": GCAL_REDIRECT_URI,
            "grant_type": "authorization_code",
            "code": code,
        })
        tokens = resp.json()
        if "error" in tokens:
            print(f"GCal token error: {tokens}")
            return redirect(f"{FRONTEND_URL}?gcal=error")

        expires_in = tokens.get("expires_in", 3600)
        expiry = (datetime.datetime.now(timezone.utc) + datetime.timedelta(seconds=expires_in)).isoformat()

        supabase.table("profiles").update({
            "gcal_access_token": tokens["access_token"],
            "gcal_refresh_token": tokens.get("refresh_token"),
            "gcal_token_expiry": expiry,
            "gcal_connected": True,
        }).eq("id", user_id).execute()

        return redirect(f"{FRONTEND_URL}?gcal=connected")
    except Exception as e:
        print(f"GCal OAuth callback error: {e}")
        return redirect(f"{FRONTEND_URL}?gcal=error")


@app.route('/health', methods=['GET'])
def health_check():
    return {"status": "ok"}, 200

port = int(os.environ.get('PORT', 5000))
print(f"Flask app starting on 0.0.0.0:{port}")
print(f"Environment variables: PORT={port}")

if __name__ == "__main__":
    try:
        app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
    except Exception as e:
        print(f"Error starting Flask app: {e}")
        import traceback
        traceback.print_exc()
        raise
