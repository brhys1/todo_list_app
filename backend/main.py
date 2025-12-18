import os
from dotenv import load_dotenv
import datetime
import google.generativeai as genai
from supabase import create_client, Client
from pydantic import BaseModel, Field
from typing import Optional
from flask import Flask, request, Response
from twilio.twiml.messaging_response import MessagingResponse

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

genai.configure(api_key=GOOGLE_API_KEY)
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

app = Flask(__name__)

class TaskSchema(BaseModel):
    task_name: str = Field(description="The core action item (e.g., 'Buy Milk').")
    due_date: str = Field(description="The due date in YYYY-MM-DD format. Calculate this based on today's date.")
    due_time: Optional[str] = Field(description="The time in 24-hour HH:MM format if mentioned (e.g. 17:00).")
    priority: str = Field(description="Priority level: 'High', 'Medium', or 'Low'.")
    category: str = Field(description="A single word tag like 'Work', 'Personal', 'Health'.")

def parse_text_to_task(user_text: str):
    
    today = datetime.date.today()
    day_name = today.strftime("%A") 
    full_date = today.strftime("%Y-%m-%d")

    prompt = f"""
    You are a personal scheduling assistant.
    CURRENT DATE: {day_name}, {full_date}.
    
    User Input: "{user_text}"
    
    Instructions:
    - Extract the task details.
    - If the user says "tomorrow" or "next friday", calculate the exact YYYY-MM-DD date based on the CURRENT DATE.
    - If no time is specified, leave due_time null.
    """

    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            response_schema=TaskSchema
        )
    )

    try:
        response = model.generate_content(prompt)
        
        task_data = TaskSchema.model_validate_json(response.text)
        return task_data
        
    except Exception as e:
        print(f"Error parsing task: {e}")
        return None

def save_to_supabase(task_data: TaskSchema):
    try:
        data_payload = task_data.model_dump()
        
        response = supabase.table("tasks").insert(data_payload).execute()
        
        if response.data:
            print(f"Saved to DB: {task_data.task_name} ({task_data.due_date})")
            return response.data
        else:
            print("Database insert returned empty response.")
            return None
            
    except Exception as e:
        print(f"Database Error: {e}")
        return None

@app.route('/webhook/sms', methods=['POST'])
def sms_webhook():
    """Webhook endpoint to receive SMS messages from Twilio"""
    incoming_message = request.form.get('Body', '').strip()
    from_number = request.form.get('From', '')
    
    print(f"Received SMS from {from_number}: '{incoming_message}'")
    
    if not incoming_message:
        resp = MessagingResponse()
        resp.message("I didn't receive any message. Please try again!")
        return Response(str(resp), mimetype='text/xml'), 200
    
    task_object = parse_text_to_task(incoming_message)
    
    if task_object:
        print(f"🤖 AI Parsed: {task_object.task_name}")
        
        result = save_to_supabase(task_object)
        
        if result:
            resp = MessagingResponse()
            resp.message(
                f"✅ Task added: {task_object.task_name}\n"
                f"📅 Due: {task_object.due_date}"
                + (f" at {task_object.due_time}" if task_object.due_time else "")
                + f"\n🏷️ Category: {task_object.category}\n"
                f"⚡ Priority: {task_object.priority}"
            )
            return Response(str(resp), mimetype='text/xml'), 200
        else:
            resp = MessagingResponse()
            resp.message("Failed to save task to database. Please try again.")
            return Response(str(resp), mimetype='text/xml'), 200
    else:
        resp = MessagingResponse()
        resp.message("I couldn't understand that task. Please try rephrasing it!")
        return Response(str(resp), mimetype='text/xml'), 200


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return {"status": "ok"}, 200


if __name__ == "__main__":
    port = int(os.environ.get('PORT', 5000))
    app.run(host='localhost', port=port, debug=True)