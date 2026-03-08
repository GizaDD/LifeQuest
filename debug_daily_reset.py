#!/usr/bin/env python3
"""
Debug Daily Mission Reset Issue
"""

import requests
import json
from datetime import datetime, timedelta

BASE_URL = "https://skill-grinder-4.preview.emergentagent.com/api"

def make_request(method, endpoint, data=None):
    """Make HTTP request"""
    url = f"{BASE_URL}{endpoint}"
    
    if method == "GET":
        response = requests.get(url)
    elif method == "POST":
        response = requests.post(url, json=data)
    else:
        return None
    
    return response.json() if response.text else {}

def debug_daily_reset():
    print("=== DEBUGGING DAILY MISSION RESET ===")
    
    # 1. Create a daily mission
    daily_mission = {
        "title": "Debug Daily Mission",
        "description": "Debug daily reset",
        "type": "daily",
        "totalXPReward": 20,
        "tasks": [{
            "title": "Debug Task",
            "xpReward": 10,
            "steps": [{"title": "Debug Step", "xpReward": 5}]
        }]
    }
    
    created = make_request("POST", "/missions", daily_mission)
    mission_id = created['id']
    print(f"Created daily mission: {mission_id}")
    print(f"Initial lastResetDate: {created.get('lastResetDate')}")
    
    # 2. Complete the mission
    complete_result = make_request("POST", f"/complete/step/{mission_id}/0/0")
    print(f"Mission completed: {complete_result['mission']['isCompleted']}")
    
    # 3. Check mission before reset
    mission_before = make_request("GET", f"/missions/{mission_id}")
    print(f"Before reset - isCompleted: {mission_before['isCompleted']}")
    print(f"Before reset - lastResetDate: {mission_before.get('lastResetDate')}")
    
    # 4. Call reset
    reset_result = make_request("POST", "/user/reset-daily")
    print(f"Reset response: {reset_result}")
    
    # 5. Check mission after reset
    mission_after = make_request("GET", f"/missions/{mission_id}")
    print(f"After reset - isCompleted: {mission_after['isCompleted']}")
    print(f"After reset - lastResetDate: {mission_after.get('lastResetDate')}")
    
    # 6. Check the date logic
    last_reset_str = mission_before.get('lastResetDate')
    if last_reset_str:
        last_reset_date = datetime.fromisoformat(last_reset_str.replace('Z', '+00:00'))
        today = datetime.utcnow().date()
        print(f"Last reset date: {last_reset_date.date()}")
        print(f"Today: {today}")
        print(f"Should reset (last_reset < today): {last_reset_date.date() < today}")
    
    # Cleanup
    delete_result = make_request("DELETE", f"/missions/{mission_id}")
    print(f"Cleanup: {delete_result}")

if __name__ == "__main__":
    debug_daily_reset()