#!/usr/bin/env python3
"""
Comprehensive Backend API Tests for RPG Life Gamification App
Tests all endpoints systematically as outlined in the review request.
"""

import requests
import json
import sys
from datetime import datetime
from typing import Dict, List, Any

# Configuration
BASE_URL = "https://skill-grinder-4.preview.emergentagent.com/api"

class RPGBackendTester:
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
    
    def test_1_user_endpoint(self):
        """Test 1: User Endpoint - Auto-creation and progressive XP system"""
        print("\n=== TEST 1: USER ENDPOINT ===")
        
        # Test GET /api/user - should auto-create user
        success, data, status = self.make_request("GET", "/user")
        
        if not success:
            self.log_test("User auto-creation", False, f"Failed to get user (status: {status})", data)
            return
        
        # Verify response structure
        required_fields = ['id', 'level', 'currentXP', 'xpToNextLevel', 'totalXP']
        missing_fields = [field for field in required_fields if field not in data]
        
        if missing_fields:
            self.log_test("User response structure", False, f"Missing fields: {missing_fields}", data)
            return
        
        # Verify initial values
        if data['level'] != 1 or data['currentXP'] != 0 or data['xpToNextLevel'] != 100:
            self.log_test("User initial values", False, 
                         f"Expected level=1, currentXP=0, xpToNextLevel=100, got level={data['level']}, currentXP={data['currentXP']}, xpToNextLevel={data['xpToNextLevel']}", 
                         data)
            return
        
        self.log_test("User auto-creation", True, "User created with correct initial values", data)
        
        # Store user data for later tests
        self.user_data = data
    
    def test_2_skills_endpoints(self):
        """Test 2: Skills Endpoints - Default skills and CRUD operations"""
        print("\n=== TEST 2: SKILLS ENDPOINTS ===")
        
        # Test GET /api/skills - should have 6 default skills
        success, skills_data, status = self.make_request("GET", "/skills")
        
        if not success:
            self.log_test("Get skills", False, f"Failed to get skills (status: {status})", skills_data)
            return
        
        if not isinstance(skills_data, list):
            self.log_test("Skills response format", False, "Expected list of skills", skills_data)
            return
        
        # Check for 6 default skills
        expected_skills = ["Здоровье", "Интеллект", "Дисциплина", "Финансы", "Коммуникация", "Креативность"]
        skill_names = [skill.get('name', '') for skill in skills_data]
        
        missing_skills = [skill for skill in expected_skills if skill not in skill_names]
        if missing_skills:
            self.log_test("Default skills creation", False, f"Missing default skills: {missing_skills}", skill_names)
            return
        
        self.log_test("Default skills creation", True, f"All 6 default skills found: {expected_skills}")
        
        # Test POST /api/skills - create custom skill
        custom_skill_data = {"name": "Test Custom Skill"}
        success, created_skill, status = self.make_request("POST", "/skills", custom_skill_data)
        
        if not success:
            self.log_test("Create custom skill", False, f"Failed to create skill (status: {status})", created_skill)
            return
        
        if created_skill.get('name') != custom_skill_data['name'] or created_skill.get('isDefault') != False:
            self.log_test("Create custom skill", False, "Created skill has incorrect properties", created_skill)
            return
        
        self.log_test("Create custom skill", True, "Custom skill created successfully")
        self.created_ids["skills"].append(created_skill['id'])
        
        # Test DELETE custom skill
        success, delete_response, status = self.make_request("DELETE", f"/skills/{created_skill['id']}")
        
        if not success:
            self.log_test("Delete custom skill", False, f"Failed to delete custom skill (status: {status})", delete_response)
            return
        
        self.log_test("Delete custom skill", True, "Custom skill deleted successfully")
        
        # Test DELETE default skill (should fail)
        default_skill_id = None
        for skill in skills_data:
            if skill.get('isDefault', False):
                default_skill_id = skill['id']
                break
        
        if default_skill_id:
            success, delete_response, status = self.make_request("DELETE", f"/skills/{default_skill_id}")
            
            if success:
                self.log_test("Protect default skills", False, "Default skill was deleted (should be protected)", delete_response)
            else:
                self.log_test("Protect default skills", True, "Default skill deletion correctly blocked")
        else:
            self.log_test("Protect default skills", False, "No default skill found to test protection")
    
    def test_3_missions_endpoints(self):
        """Test 3: Missions Endpoints - CRUD operations with nested tasks/steps"""
        print("\n=== TEST 3: MISSIONS ENDPOINTS ===")
        
        # Test GET /api/missions (initially empty)
        success, missions_data, status = self.make_request("GET", "/missions")
        
        if not success:
            self.log_test("Get missions", False, f"Failed to get missions (status: {status})", missions_data)
            return
        
        self.log_test("Get missions", True, f"Retrieved {len(missions_data)} missions")
        
        # Create test mission with nested tasks and steps
        test_mission = {
            "title": "Test Mission",
            "description": "A comprehensive test mission",
            "type": "main",
            "totalXPReward": 50,
            "skillRewards": [],
            "tasks": [
                {
                    "title": "Task 1",
                    "xpReward": 20,
                    "steps": [
                        {"title": "Step 1.1", "xpReward": 10, "isCompleted": False},
                        {"title": "Step 1.2", "xpReward": 15, "isCompleted": False}
                    ],
                    "isCompleted": False
                },
                {
                    "title": "Task 2", 
                    "xpReward": 25,
                    "steps": [
                        {"title": "Step 2.1", "xpReward": 12, "isCompleted": False},
                        {"title": "Step 2.2", "xpReward": 18, "isCompleted": False}
                    ],
                    "isCompleted": False
                }
            ]
        }
        
        # Test POST /api/missions
        success, created_mission, status = self.make_request("POST", "/missions", test_mission)
        
        if not success:
            self.log_test("Create mission", False, f"Failed to create mission (status: {status})", created_mission)
            return
        
        # Verify mission structure
        if (created_mission.get('title') != test_mission['title'] or 
            len(created_mission.get('tasks', [])) != 2):
            self.log_test("Create mission", False, "Created mission has incorrect structure", created_mission)
            return
        
        self.log_test("Create mission", True, "Mission with nested tasks/steps created successfully")
        self.created_ids["missions"].append(created_mission['id'])
        self.test_mission = created_mission
        
        # Test GET /api/missions/{id}
        success, retrieved_mission, status = self.make_request("GET", f"/missions/{created_mission['id']}")
        
        if not success:
            self.log_test("Get specific mission", False, f"Failed to get mission (status: {status})", retrieved_mission)
            return
        
        if retrieved_mission['id'] != created_mission['id']:
            self.log_test("Get specific mission", False, "Retrieved mission ID mismatch", retrieved_mission)
            return
        
        self.log_test("Get specific mission", True, "Specific mission retrieved successfully")
    
    def test_4_completion_flow(self):
        """Test 4: CRITICAL - Complete steps, tasks, and mission with XP flow"""
        print("\n=== TEST 4: COMPLETION FLOW (CRITICAL) ===")
        
        if not hasattr(self, 'test_mission'):
            self.log_test("Completion flow setup", False, "No test mission available for completion testing")
            return
        
        mission_id = self.test_mission['id']
        
        # Get initial user XP
        success, initial_user, status = self.make_request("GET", "/user")
        if not success:
            self.log_test("Get initial user XP", False, f"Failed to get user (status: {status})", initial_user)
            return
        
        initial_xp = initial_user['currentXP']
        initial_total_xp = initial_user['totalXP']
        
        # Complete Step 1.1 (Task 0, Step 0)
        success, completion_result, status = self.make_request("POST", f"/complete/step/{mission_id}/0/0")
        
        if not success:
            self.log_test("Complete step 1.1", False, f"Failed to complete step (status: {status})", completion_result)
            return
        
        # Verify XP was awarded (step XP = 10)
        if completion_result['user']['currentXP'] != initial_xp + 10:
            self.log_test("Step XP award", False, 
                         f"Expected XP: {initial_xp + 10}, got: {completion_result['user']['currentXP']}", 
                         completion_result)
            return
        
        self.log_test("Complete step 1.1", True, f"Step completed, XP awarded: {completion_result['user']['currentXP']}")
        
        # Complete Step 1.2 (Task 0, Step 1) - should complete Task 1
        success, completion_result, status = self.make_request("POST", f"/complete/step/{mission_id}/0/1")
        
        if not success:
            self.log_test("Complete step 1.2 + Task 1", False, f"Failed to complete step (status: {status})", completion_result)
            return
        
        # Verify task completion and XP (step XP = 15 + task XP = 20 = 35 total additional)
        expected_xp = initial_xp + 10 + 15 + 20  # previous step + current step + task
        if completion_result['user']['currentXP'] != expected_xp:
            self.log_test("Task auto-completion", False, 
                         f"Expected XP: {expected_xp}, got: {completion_result['user']['currentXP']}", 
                         completion_result)
            return
        
        # Check task is marked as completed
        task_0 = completion_result['mission']['tasks'][0]
        if not task_0['isCompleted']:
            self.log_test("Task auto-completion", False, "Task 0 should be completed", completion_result['mission'])
            return
        
        self.log_test("Complete step 1.2 + Task 1", True, "Task auto-completed with correct XP")
        
        # Complete Task 2 steps to finish mission
        # Complete Step 2.1 (Task 1, Step 0)
        success, completion_result, status = self.make_request("POST", f"/complete/step/{mission_id}/1/0")
        
        if not success:
            self.log_test("Complete step 2.1", False, f"Failed to complete step (status: {status})", completion_result)
            return
        
        # Complete Step 2.2 (Task 1, Step 1) - should complete Task 2 and Mission
        success, completion_result, status = self.make_request("POST", f"/complete/step/{mission_id}/1/1")
        
        if not success:
            self.log_test("Complete step 2.2 + Mission", False, f"Failed to complete final step (status: {status})", completion_result)
            return
        
        # Verify mission completion
        if not completion_result['mission']['isCompleted']:
            self.log_test("Mission auto-completion", False, "Mission should be completed", completion_result['mission'])
            return
        
        # Verify total XP includes mission reward (50)
        # Total should be: initial + step1.1(10) + step1.2(15) + task1(20) + step2.1(12) + step2.2(18) + task2(25) + mission(50)
        expected_final_xp = initial_xp + 10 + 15 + 20 + 12 + 18 + 25 + 50  # = 150 total additional
        if completion_result['user']['currentXP'] != expected_final_xp:
            self.log_test("Mission completion XP", False, 
                         f"Expected final XP: {expected_final_xp}, got: {completion_result['user']['currentXP']}", 
                         completion_result)
            return
        
        self.log_test("Complete step 2.2 + Mission", True, f"Mission completed with total XP: {completion_result['user']['currentXP']}")
        
        # Test level-up logic
        final_user = completion_result['user']
        if final_user['currentXP'] >= 100:  # Should level up
            if final_user['level'] == 1:
                self.log_test("Level-up logic", False, f"User should have leveled up with {final_user['currentXP']} XP", final_user)
                return
        
        self.log_test("Level-up logic", True, f"Level progression working: Level {final_user['level']}, XP {final_user['currentXP']}/{final_user['xpToNextLevel']}")
    
    def test_5_daily_missions(self):
        """Test 5: Daily Missions Reset"""
        print("\n=== TEST 5: DAILY MISSIONS RESET ===")
        
        # Create a daily mission first
        daily_mission = {
            "title": "Daily Test Mission",
            "description": "Test daily mission reset",
            "type": "daily", 
            "totalXPReward": 30,
            "skillRewards": [],
            "tasks": [
                {
                    "title": "Daily Task",
                    "xpReward": 15,
                    "steps": [
                        {"title": "Daily Step", "xpReward": 5, "isCompleted": False}
                    ],
                    "isCompleted": False
                }
            ]
        }
        
        success, created_daily, status = self.make_request("POST", "/missions", daily_mission)
        
        if not success:
            self.log_test("Create daily mission", False, f"Failed to create daily mission (status: {status})", created_daily)
            return
        
        self.log_test("Create daily mission", True, "Daily mission created")
        self.created_ids["missions"].append(created_daily['id'])
        
        # Complete the daily mission step
        success, completion_result, status = self.make_request("POST", f"/complete/step/{created_daily['id']}/0/0")
        
        if success and completion_result['mission']['isCompleted']:
            self.log_test("Complete daily mission", True, "Daily mission completed")
        else:
            self.log_test("Complete daily mission", False, "Daily mission completion failed", completion_result)
            return
        
        # Test reset functionality
        success, reset_result, status = self.make_request("POST", "/user/reset-daily")
        
        if not success:
            self.log_test("Daily reset", False, f"Failed to reset daily missions (status: {status})", reset_result)
            return
        
        self.log_test("Daily reset", True, "Daily missions reset successfully")
        
        # Verify mission was reset
        success, reset_mission, status = self.make_request("GET", f"/missions/{created_daily['id']}")
        
        if not success:
            self.log_test("Verify daily reset", False, f"Failed to get reset mission (status: {status})", reset_mission)
            return
        
        if reset_mission['isCompleted']:
            self.log_test("Verify daily reset", False, "Daily mission should be reset to incomplete", reset_mission)
            return
        
        self.log_test("Verify daily reset", True, "Daily mission correctly reset to incomplete")
    
    def test_6_skill_xp_rewards(self):
        """Test 6: Skill XP rewards on mission completion"""
        print("\n=== TEST 6: SKILL XP REWARDS ===")
        
        # Get a default skill to test with
        success, skills_data, status = self.make_request("GET", "/skills")
        
        if not success or not skills_data:
            self.log_test("Get skills for XP test", False, f"Failed to get skills (status: {status})", skills_data)
            return
        
        test_skill = skills_data[0]  # Use first skill
        initial_skill_xp = test_skill['currentXP']
        
        # Create mission with skill reward
        skill_mission = {
            "title": "Skill XP Test Mission",
            "description": "Test skill XP rewards",
            "type": "side",
            "totalXPReward": 25,
            "skillRewards": [
                {"skillId": test_skill['id'], "xpAmount": 75}  # Should level up skill
            ],
            "tasks": [
                {
                    "title": "Skill Task",
                    "xpReward": 10,
                    "steps": [
                        {"title": "Skill Step", "xpReward": 5, "isCompleted": False}
                    ],
                    "isCompleted": False
                }
            ]
        }
        
        success, created_skill_mission, status = self.make_request("POST", "/missions", skill_mission)
        
        if not success:
            self.log_test("Create skill mission", False, f"Failed to create skill mission (status: {status})", created_skill_mission)
            return
        
        self.log_test("Create skill mission", True, "Mission with skill rewards created")
        self.created_ids["missions"].append(created_skill_mission['id'])
        
        # Complete the mission to trigger skill XP
        success, completion_result, status = self.make_request("POST", f"/complete/step/{created_skill_mission['id']}/0/0")
        
        if not success:
            self.log_test("Complete skill mission", False, f"Failed to complete skill mission (status: {status})", completion_result)
            return
        
        # Check if skill received XP
        success, updated_skills, status = self.make_request("GET", "/skills")
        
        if not success:
            self.log_test("Get updated skills", False, f"Failed to get updated skills (status: {status})", updated_skills)
            return
        
        updated_skill = None
        for skill in updated_skills:
            if skill['id'] == test_skill['id']:
                updated_skill = skill
                break
        
        if not updated_skill:
            self.log_test("Find updated skill", False, "Test skill not found in updated list")
            return
        
        expected_skill_xp = initial_skill_xp + 75
        if updated_skill['currentXP'] == expected_skill_xp or updated_skill['level'] > test_skill['level']:
            self.log_test("Skill XP reward", True, f"Skill XP updated: {test_skill['currentXP']} -> {updated_skill['currentXP']}, Level: {test_skill['level']} -> {updated_skill['level']}")
        else:
            self.log_test("Skill XP reward", False, f"Skill XP not updated correctly. Expected: {expected_skill_xp}, Got: {updated_skill['currentXP']}", updated_skill)
    
    def test_7_error_handling(self):
        """Test 7: Error handling for invalid requests"""
        print("\n=== TEST 7: ERROR HANDLING ===")
        
        # Test invalid mission ID
        success, error_response, status = self.make_request("GET", "/missions/invalid_id")
        if success:
            self.log_test("Invalid mission ID", False, "Should return error for invalid ID", error_response)
        else:
            self.log_test("Invalid mission ID", True, f"Correctly returned error (status: {status})")
        
        # Test completing already completed step
        if hasattr(self, 'test_mission'):
            # Try to complete the same step again
            success, error_response, status = self.make_request("POST", f"/complete/step/{self.test_mission['id']}/0/0")
            if success:
                self.log_test("Already completed step", False, "Should return error for already completed step", error_response)
            else:
                self.log_test("Already completed step", True, f"Correctly prevented re-completion (status: {status})")
        
        # Test invalid step indices
        if hasattr(self, 'test_mission'):
            success, error_response, status = self.make_request("POST", f"/complete/step/{self.test_mission['id']}/999/999")
            if success:
                self.log_test("Invalid step indices", False, "Should return error for invalid indices", error_response)
            else:
                self.log_test("Invalid step indices", True, f"Correctly handled invalid indices (status: {status})")
    
    def cleanup(self):
        """Clean up created test data"""
        print("\n=== CLEANUP ===")
        
        # Delete created missions
        for mission_id in self.created_ids["missions"]:
            success, _, _ = self.make_request("DELETE", f"/missions/{mission_id}")
            if success:
                print(f"✅ Deleted mission: {mission_id}")
            else:
                print(f"❌ Failed to delete mission: {mission_id}")
        
        # Delete created skills
        for skill_id in self.created_ids["skills"]:
            success, _, _ = self.make_request("DELETE", f"/skills/{skill_id}")
            if success:
                print(f"✅ Deleted skill: {skill_id}")
            else:
                print(f"❌ Failed to delete skill: {skill_id}")
    
    def run_all_tests(self):
        """Run all tests in sequence"""
        print(f"🚀 Starting comprehensive backend tests for: {self.base_url}")
        print("=" * 80)
        
        try:
            self.test_1_user_endpoint()
            self.test_2_skills_endpoints()
            self.test_3_missions_endpoints()
            self.test_4_completion_flow()
            self.test_5_daily_missions()
            self.test_6_skill_xp_rewards()
            self.test_7_error_handling()
        except Exception as e:
            print(f"\n💥 Test suite crashed: {str(e)}")
            self.log_test("Test suite execution", False, f"Crashed with error: {str(e)}")
        
        finally:
            self.cleanup()
            self.print_summary()
    
    def print_summary(self):
        """Print test results summary"""
        print("\n" + "=" * 80)
        print("📋 TEST RESULTS SUMMARY")
        print("=" * 80)
        
        passed = sum(1 for result in self.test_results if result["success"])
        failed = len(self.test_results) - passed
        
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"📊 Total: {len(self.test_results)}")
        
        if failed > 0:
            print(f"\n🔍 FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"   ❌ {result['test']}: {result['details']}")
        
        print("\n" + "=" * 80)
        return failed == 0


def main():
    """Main test execution"""
    tester = RPGBackendTester(BASE_URL)
    success = tester.run_all_tests()
    
    # Exit with error code if tests failed
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()