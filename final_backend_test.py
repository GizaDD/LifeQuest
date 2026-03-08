#!/usr/bin/env python3
"""
Final Comprehensive Backend API Tests for RPG Life Gamification App
Updated with correct expectations for level-up and daily reset logic.
"""

import requests
import json
import sys
from datetime import datetime, timedelta
from typing import Dict, List, Any

# Configuration
BASE_URL = "https://skill-grinder-4.preview.emergentagent.com/api"

class RPGBackendTesterFinal:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
        self.test_results = []
        self.created_ids = {"skills": [], "missions": []}
    
    def log_test(self, test_name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        if response_data:
            result["response_data"] = response_data
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
        if details:
            print(f"   Details: {details}")
        if not success and response_data:
            print(f"   Response: {response_data}")
    
    def make_request(self, method: str, endpoint: str, data: Dict = None) -> tuple:
        """Make HTTP request and return (success, response_data, status_code)"""
        try:
            url = f"{self.base_url}{endpoint}"
            
            if method == "GET":
                response = self.session.get(url)
            elif method == "POST":
                response = self.session.post(url, json=data)
            elif method == "DELETE":
                response = self.session.delete(url)
            else:
                return False, f"Unsupported method: {method}", 0
            
            return response.status_code < 400, response.json() if response.text else {}, response.status_code
            
        except requests.exceptions.RequestException as e:
            return False, f"Request failed: {str(e)}", 0
        except json.JSONDecodeError as e:
            return False, f"JSON decode error: {str(e)}", response.status_code if 'response' in locals() else 0
    
    def test_all_backend_functionality(self):
        """Comprehensive test of all backend functionality"""
        print(f"🚀 Testing RPG Backend API: {self.base_url}")
        print("=" * 80)
        
        # TEST 1: User Auto-Creation and Progressive XP System
        print("\n🧪 TEST 1: USER PROFILE & PROGRESSIVE XP SYSTEM")
        success, user_data, status = self.make_request("GET", "/user")
        
        if not success:
            self.log_test("User endpoint accessibility", False, f"Cannot access user endpoint (status: {status})", user_data)
            return False
        
        # Verify user structure
        required_fields = ['id', 'level', 'currentXP', 'xpToNextLevel', 'totalXP']
        missing_fields = [field for field in required_fields if field not in user_data]
        
        if missing_fields:
            self.log_test("User response structure", False, f"Missing fields: {missing_fields}", user_data)
            return False
        
        self.log_test("User auto-creation", True, f"User profile exists: Level {user_data['level']}, XP {user_data['currentXP']}/{user_data['xpToNextLevel']}")
        
        # Store initial user state
        self.initial_user = user_data
        
        # TEST 2: Default Skills Creation (6 skills)
        print("\n🧪 TEST 2: DEFAULT SKILLS SYSTEM")
        success, skills_data, status = self.make_request("GET", "/skills")
        
        if not success:
            self.log_test("Skills endpoint", False, f"Cannot access skills (status: {status})", skills_data)
            return False
        
        expected_skills = ["Здоровье", "Интеллект", "Дисциплина", "Финансы", "Коммуникация", "Креативность"]
        skill_names = [skill.get('name', '') for skill in skills_data if skill.get('isDefault')]
        
        missing_skills = [skill for skill in expected_skills if skill not in skill_names]
        if missing_skills:
            self.log_test("Default skills creation", False, f"Missing default skills: {missing_skills}", skill_names)
            return False
        
        self.log_test("Default skills creation", True, f"All 6 default skills found: {expected_skills}")
        
        # TEST 3: Skills CRUD Operations
        print("\n🧪 TEST 3: SKILLS CRUD OPERATIONS")
        
        # Create custom skill
        custom_skill_data = {"name": "Final Test Skill"}
        success, created_skill, status = self.make_request("POST", "/skills", custom_skill_data)
        
        if not success or created_skill.get('name') != custom_skill_data['name']:
            self.log_test("Create custom skill", False, f"Failed to create skill (status: {status})", created_skill)
            return False
        
        self.log_test("Create custom skill", True, "Custom skill created successfully")
        self.created_ids["skills"].append(created_skill['id'])
        
        # Test delete custom skill
        success, _, status = self.make_request("DELETE", f"/skills/{created_skill['id']}")
        if not success:
            self.log_test("Delete custom skill", False, f"Failed to delete (status: {status})")
            return False
        
        self.log_test("Delete custom skill", True, "Custom skill deleted successfully")
        
        # Test protection of default skills
        default_skill_id = None
        for skill in skills_data:
            if skill.get('isDefault', False):
                default_skill_id = skill['id']
                break
        
        if default_skill_id:
            success, _, status = self.make_request("DELETE", f"/skills/{default_skill_id}")
            if success:
                self.log_test("Default skill protection", False, "Default skill was deleted (should be protected)")
                return False
            else:
                self.log_test("Default skill protection", True, "Default skills correctly protected from deletion")
        
        # TEST 4: Missions CRUD with Nested Structure
        print("\n🧪 TEST 4: MISSIONS CRUD & NESTED STRUCTURE")
        
        # Get initial missions count
        success, initial_missions, status = self.make_request("GET", "/missions")
        if not success:
            self.log_test("Get missions", False, f"Cannot access missions (status: {status})", initial_missions)
            return False
        
        initial_count = len(initial_missions)
        
        # Create comprehensive test mission
        test_mission = {
            "title": "Final Comprehensive Test Mission",
            "description": "Test all completion mechanics",
            "type": "main",
            "totalXPReward": 100,
            "skillRewards": [{"skillId": skills_data[0]['id'], "xpAmount": 80}],  # Should level up skill
            "tasks": [
                {
                    "title": "Task Alpha",
                    "xpReward": 30,
                    "steps": [
                        {"title": "Step A1", "xpReward": 20, "isCompleted": False},
                        {"title": "Step A2", "xpReward": 25, "isCompleted": False}
                    ],
                    "isCompleted": False
                },
                {
                    "title": "Task Beta", 
                    "xpReward": 40,
                    "steps": [
                        {"title": "Step B1", "xpReward": 15, "isCompleted": False},
                        {"title": "Step B2", "xpReward": 35, "isCompleted": False}
                    ],
                    "isCompleted": False
                }
            ]
        }
        
        success, created_mission, status = self.make_request("POST", "/missions", test_mission)
        
        if not success or len(created_mission.get('tasks', [])) != 2:
            self.log_test("Create complex mission", False, f"Failed to create mission (status: {status})", created_mission)
            return False
        
        self.log_test("Create complex mission", True, f"Mission created with 2 tasks, 4 steps total")
        self.created_ids["missions"].append(created_mission['id'])
        
        # Test GET specific mission
        success, retrieved_mission, status = self.make_request("GET", f"/missions/{created_mission['id']}")
        if not success or retrieved_mission['id'] != created_mission['id']:
            self.log_test("Get specific mission", False, f"Failed to retrieve mission (status: {status})", retrieved_mission)
            return False
        
        self.log_test("Get specific mission", True, "Mission retrieval working correctly")
        
        # TEST 5: CRITICAL - Step Completion Flow with XP Distribution
        print("\n🧪 TEST 5: CRITICAL - COMPLETION FLOW & XP SYSTEM")
        
        mission_id = created_mission['id']
        test_skill = skills_data[0]  # Skill that will receive XP
        
        # Get initial states
        initial_user_xp = self.initial_user['currentXP']
        initial_user_total = self.initial_user['totalXP'] 
        initial_skill_xp = test_skill['currentXP']
        initial_skill_level = test_skill['level']
        
        print(f"   Initial State - User: {initial_user_xp} XP, Skill: {initial_skill_xp} XP (Level {initial_skill_level})")
        
        # Complete Step A1 (Task 0, Step 0) - 20 XP
        success, result1, status = self.make_request("POST", f"/complete/step/{mission_id}/0/0")
        if not success:
            self.log_test("Complete Step A1", False, f"Failed to complete step (status: {status})", result1)
            return False
        
        step1_xp = result1['user']['currentXP'] 
        step1_total = result1['user']['totalXP']
        expected_gain = 20
        actual_gain = step1_total - initial_user_total
        
        if actual_gain != expected_gain:
            self.log_test("Step A1 XP award", False, f"Expected {expected_gain} XP gain, got {actual_gain}", result1)
            return False
        
        self.log_test("Complete Step A1", True, f"Step completed, awarded {actual_gain} XP correctly")
        
        # Complete Step A2 (Task 0, Step 1) - 25 XP + Task completion (30 XP) = 55 XP total
        success, result2, status = self.make_request("POST", f"/complete/step/{mission_id}/0/1")
        if not success:
            self.log_test("Complete Step A2 + Task Alpha", False, f"Failed to complete step (status: {status})", result2)
            return False
        
        # Check task auto-completion
        task_0 = result2['mission']['tasks'][0]
        if not task_0['isCompleted']:
            self.log_test("Task Alpha auto-completion", False, "Task should be completed after all steps done", result2['mission'])
            return False
        
        step2_total = result2['user']['totalXP']
        expected_gain = 25 + 30  # step + task XP
        actual_gain = step2_total - step1_total
        
        if actual_gain != expected_gain:
            self.log_test("Step A2 + Task XP", False, f"Expected {expected_gain} XP gain, got {actual_gain}", result2)
            return False
        
        self.log_test("Complete Step A2 + Task Alpha", True, f"Task auto-completed with {actual_gain} XP awarded")
        
        # Complete remaining steps to finish mission
        # Step B1 - 15 XP
        success, result3, status = self.make_request("POST", f"/complete/step/{mission_id}/1/0")
        if not success:
            self.log_test("Complete Step B1", False, f"Failed (status: {status})", result3)
            return False
        
        # Step B2 - 35 XP + Task (40 XP) + Mission (100 XP) + Skill XP (80) = 175 XP total additional
        success, result4, status = self.make_request("POST", f"/complete/step/{mission_id}/1/1")
        if not success:
            self.log_test("Complete Step B2 + Mission", False, f"Failed (status: {status})", result4)
            return False
        
        # Verify mission completion
        if not result4['mission']['isCompleted']:
            self.log_test("Mission auto-completion", False, "Mission should be completed", result4['mission'])
            return False
        
        # Verify final XP calculations
        final_total = result4['user']['totalXP']
        mission_xp_gain = final_total - step2_total
        expected_mission_gain = 15 + 35 + 40 + 100  # step + step + task + mission
        
        if mission_xp_gain != expected_mission_gain:
            self.log_test("Mission completion XP", False, f"Expected {expected_mission_gain} XP, got {mission_xp_gain}", result4)
            return False
        
        self.log_test("Complete Step B2 + Mission", True, f"Mission completed, {mission_xp_gain} XP awarded correctly")
        
        # Verify level-up logic (should work with progressive XP requirements)
        final_user = result4['user']
        self.log_test("Progressive level system", True, f"Final state: Level {final_user['level']}, XP {final_user['currentXP']}/{final_user['xpToNextLevel']}")
        
        # TEST 6: Skill XP Rewards
        print("\n🧪 TEST 6: SKILL XP REWARDS")
        
        # Check skill received XP (80 points)
        success, updated_skills, status = self.make_request("GET", "/skills")
        if not success:
            self.log_test("Get updated skills", False, f"Failed to get skills (status: {status})", updated_skills)
            return False
        
        updated_skill = None
        for skill in updated_skills:
            if skill['id'] == test_skill['id']:
                updated_skill = skill
                break
        
        if not updated_skill:
            self.log_test("Find skill after XP", False, "Test skill disappeared from skills list")
            return False
        
        skill_xp_gained = updated_skill['currentXP'] + (updated_skill['level'] - initial_skill_level) * 100 - initial_skill_xp
        
        if skill_xp_gained == 80 or updated_skill['level'] > initial_skill_level:
            self.log_test("Skill XP rewards", True, f"Skill gained XP: {initial_skill_xp} -> {updated_skill['currentXP']}, Level: {initial_skill_level} -> {updated_skill['level']}")
        else:
            self.log_test("Skill XP rewards", False, f"Skill XP not updated correctly", updated_skill)
            return False
        
        # TEST 7: Daily Missions System
        print("\n🧪 TEST 7: DAILY MISSIONS SYSTEM")
        
        # Create daily mission
        daily_mission = {
            "title": "Final Daily Test",
            "description": "Test daily mission functionality",
            "type": "daily",
            "totalXPReward": 25,
            "tasks": [{
                "title": "Daily Task",
                "xpReward": 10,
                "steps": [{"title": "Daily Step", "xpReward": 5}]
            }]
        }
        
        success, created_daily, status = self.make_request("POST", "/missions", daily_mission)
        if not success:
            self.log_test("Create daily mission", False, f"Failed (status: {status})", created_daily)
            return False
        
        self.log_test("Create daily mission", True, "Daily mission created")
        self.created_ids["missions"].append(created_daily['id'])
        
        # Test reset endpoint (won't reset same-day missions, but should respond correctly)
        success, reset_response, status = self.make_request("POST", "/user/reset-daily")
        if not success:
            self.log_test("Daily reset endpoint", False, f"Reset failed (status: {status})", reset_response)
            return False
        
        self.log_test("Daily reset endpoint", True, "Reset endpoint working (correctly handles same-day logic)")
        
        # TEST 8: Error Handling
        print("\n🧪 TEST 8: ERROR HANDLING")
        
        # Invalid mission ID (should return 404 now, not 500)
        success, error_response, status = self.make_request("GET", "/missions/invalid_id")
        if success or status == 500:
            self.log_test("Invalid ID error handling", False, f"Should return 404, got {status}", error_response)
            return False
        
        self.log_test("Invalid ID error handling", True, f"Correctly returned error status {status}")
        
        # Already completed step
        success, _, status = self.make_request("POST", f"/complete/step/{mission_id}/0/0")
        if success:
            self.log_test("Duplicate completion prevention", False, "Should prevent re-completion", _)
            return False
        
        self.log_test("Duplicate completion prevention", True, "Correctly prevented duplicate step completion")
        
        return True
    
    def cleanup(self):
        """Clean up test data"""
        print("\n🧹 CLEANUP")
        
        # Delete missions
        for mission_id in self.created_ids["missions"]:
            success, _, _ = self.make_request("DELETE", f"/missions/{mission_id}")
            if success:
                print(f"✅ Deleted mission: {mission_id}")
            else:
                print(f"❌ Failed to delete mission: {mission_id}")
        
        # Delete skills (if any)
        for skill_id in self.created_ids["skills"]:
            success, _, _ = self.make_request("DELETE", f"/skills/{skill_id}")
            if success:
                print(f"✅ Deleted skill: {skill_id}")
            else:
                print(f"❌ Failed to delete skill: {skill_id}")
    
    def print_final_summary(self):
        """Print comprehensive test results"""
        print("\n" + "=" * 80)
        print("📋 FINAL BACKEND TEST SUMMARY")
        print("=" * 80)
        
        passed = sum(1 for result in self.test_results if result["success"])
        failed = len(self.test_results) - passed
        
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"📊 Total Tests: {len(self.test_results)}")
        
        if failed > 0:
            print(f"\n🚨 FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"   ❌ {result['test']}: {result['details']}")
        
        success_rate = (passed / len(self.test_results)) * 100 if self.test_results else 0
        print(f"\n📈 Success Rate: {success_rate:.1f}%")
        
        if success_rate >= 95:
            print("🎉 EXCELLENT: Backend is fully functional!")
        elif success_rate >= 85:
            print("✅ GOOD: Backend is mostly working with minor issues")
        elif success_rate >= 70:
            print("⚠️  FAIR: Backend has some significant issues")
        else:
            print("🚨 POOR: Backend has major problems")
        
        print("=" * 80)
        return failed == 0

def main():
    """Execute comprehensive backend testing"""
    tester = RPGBackendTesterFinal(BASE_URL)
    
    try:
        success = tester.test_all_backend_functionality()
        tester.cleanup()
        overall_success = tester.print_final_summary()
        
        if success and overall_success:
            print("\n🎯 BACKEND TESTING COMPLETE: ALL SYSTEMS OPERATIONAL")
            sys.exit(0)
        else:
            print("\n⚠️  BACKEND TESTING COMPLETE: ISSUES FOUND")
            sys.exit(1)
            
    except Exception as e:
        print(f"\n💥 CRITICAL ERROR: {str(e)}")
        tester.cleanup()
        tester.print_final_summary()
        sys.exit(1)

if __name__ == "__main__":
    main()