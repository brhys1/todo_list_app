import os
from dotenv import load_dotenv
import datetime
from datetime import timezone
from zoneinfo import ZoneInfo
from google import genai
from google.genai import types
from supabase import create_client, Client
from pydantic import BaseModel, Field
from typing import Optional
from flask import Flask, request, Response
from twilio.twiml.messaging_response import MessagingResponse

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

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


@app.route('/health', methods=['GET'])
def health_check():
    return {"status": "ok"}, 200

port = int(os.environ.get('PORT', 8080))
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
