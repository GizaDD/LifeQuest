# 🎮 RPG Life Gamification App - Полный код

## Оглавление
1. [Backend (FastAPI)](#backend)
2. [Frontend - Структура](#frontend-structure)
3. [Frontend - Utils](#frontend-utils)
4. [Frontend - Contexts](#frontend-contexts)
5. [Frontend - Components](#frontend-components)
6. [Frontend - Screens](#frontend-screens)
7. [Конфигурация](#configuration)

---

# Backend

## /app/backend/server.py (983 строки)

from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timedelta
from bson import ObjectId

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ==================== MODELS ====================

class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid objectid")
        return ObjectId(v)

    @classmethod
    def __modify_schema__(cls, field_schema):
        field_schema.update(type="string")


class Step(BaseModel):
    title: str
    xpReward: int
    isCompleted: bool = False
    isDaily: bool = False
    lastCompletedDate: Optional[datetime] = None

class Task(BaseModel):
    title: str
    xpReward: int
    steps: List[Step] = []
    isCompleted: bool = False
    isDaily: bool = False
    lastCompletedDate: Optional[datetime] = None

class SkillReward(BaseModel):
    skillId: str
    xpAmount: int

class Mission(BaseModel):
    id: Optional[str] = None
    title: str
    description: str
    type: str  # 'main', 'side', 'daily'
    totalXPReward: int
    skillRewards: List[SkillReward] = []
    tasks: List[Task] = []
    isCompleted: bool = False
    completedAt: Optional[datetime] = None
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    lastResetDate: Optional[datetime] = None

    class Config:
        json_encoders = {ObjectId: str}

class Skill(BaseModel):
    id: Optional[str] = None
    name: str
    level: int = 0
    currentXP: int = 0
    xpToNextLevel: int = 100
    isDefault: bool = False
    createdAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_encoders = {ObjectId: str}

class User(BaseModel):
    id: Optional[str] = None
    nickname: str = "Игрок"
    level: int = 0
    currentXP: int = 0
    xpToNextLevel: int = 100
    totalXP: int = 0
    lastDailyReset: Optional[datetime] = None
    streak: int = 0
    lastStreakDate: Optional[datetime] = None
    longestStreak: int = 0
    totalMissionsCompleted: int = 0
    totalTasksCompleted: int = 0
    totalStepsCompleted: int = 0

    class Config:
        json_encoders = {ObjectId: str}

class Reward(BaseModel):
    id: Optional[str] = None
    title: str
    description: str
    xpCost: int
    isPurchased: bool = False
    purchasedAt: Optional[datetime] = None
    createdAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_encoders = {ObjectId: str}

class MissionCreate(BaseModel):
    title: str
    description: str
    type: str
    totalXPReward: int
    skillRewards: List[SkillReward] = []
    tasks: List[Task] = []

class MissionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    totalXPReward: Optional[int] = None
    skillRewards: Optional[List[SkillReward]] = None
    tasks: Optional[List[Task]] = None

class SkillCreate(BaseModel):
    name: str

class UserUpdateNickname(BaseModel):
    nickname: str

class RewardCreate(BaseModel):
    title: str
    description: str
    xpCost: int

# ==================== HELPER FUNCTIONS ====================

def calculate_xp_for_level(level: int) -> int:
    """Calculate XP required to reach next level (progressive: 100, 200, 300...)"""
    return level * 100

async def level_up_user(user: dict) -> dict:
    """Handle user level up logic"""
    while user['currentXP'] >= user['xpToNextLevel']:
        user['currentXP'] -= user['xpToNextLevel']
        user['level'] += 1
        user['xpToNextLevel'] = calculate_xp_for_level(user['level'])
    return user

async def level_up_skill(skill: dict) -> dict:
    """Handle skill level up logic"""
    while skill['currentXP'] >= skill['xpToNextLevel']:
        skill['currentXP'] -= skill['xpToNextLevel']
        skill['level'] += 1
        # For MVP, always 100 XP per level for skills
        skill['xpToNextLevel'] = 100
    return skill

def get_streak_multiplier(streak: int) -> float:
    """Get XP multiplier based on streak days"""
    if streak >= 100:
        return 40.0
    elif streak >= 66:
        return 30.0
    elif streak >= 42:
        return 20.0
    elif streak >= 31:
        return 10.0
    elif streak >= 21:
        return 10.0
    elif streak >= 10:
        return 5.0
    return 1.0

async def update_streak():
    """Update user streak if they completed daily tasks today"""
    user = await db.users.find_one()
    if not user:
        return
    
    today = datetime.utcnow().date()
    last_streak_date = user.get('lastStreakDate')
    
    if last_streak_date:
        last_date = last_streak_date.date()
        if last_date == today:
            # Already updated today
            return
        elif last_date == today - timedelta(days=1):
            # Consecutive day
            user['streak'] += 1
            if user['streak'] > user.get('longestStreak', 0):
                user['longestStreak'] = user['streak']
        else:
            # Streak broken
            user['streak'] = 1
    else:
        # First streak
        user['streak'] = 1
    
    user['lastStreakDate'] = datetime.utcnow()
    
    await db.users.update_one(
        {'_id': user['_id']},
        {'$set': {
            'streak': user['streak'],
            'lastStreakDate': user['lastStreakDate'],
            'longestStreak': user.get('longestStreak', user['streak'])
        }}
    )

async def check_and_break_streak():
    """Break streak if user didn't complete tasks yesterday"""
    user = await db.users.find_one()
    if not user or not user.get('lastStreakDate'):
        return
    
    today = datetime.utcnow().date()
    last_date = user['lastStreakDate'].date()
    
    # If last completion was more than 1 day ago, break streak
    if (today - last_date).days > 1:
        await db.users.update_one(
            {'_id': user['_id']},
            {'$set': {'streak': 0}}
        )


async def add_xp_to_user(xp_amount: int):
    """Add XP to user and handle level ups"""
    user = await db.users.find_one()
    if not user:
        return
    
    user['currentXP'] += xp_amount
    user['totalXP'] += xp_amount
    user = await level_up_user(user)
    
    await db.users.update_one(
        {'_id': user['_id']},
        {'$set': {
            'level': user['level'],
            'currentXP': user['currentXP'],
            'xpToNextLevel': user['xpToNextLevel'],
            'totalXP': user['totalXP']
        }}
    )

async def add_xp_to_skill(skill_id: str, xp_amount: int):
    """Add XP to a skill and handle level ups"""
    skill = await db.skills.find_one({'_id': ObjectId(skill_id)})
    if not skill:
        return
    
    skill['currentXP'] += xp_amount
    skill = await level_up_skill(skill)
    
    await db.skills.update_one(
        {'_id': skill['_id']},
        {'$set': {
            'level': skill['level'],
            'currentXP': skill['currentXP'],
            'xpToNextLevel': skill['xpToNextLevel']
        }}
    )

# ==================== USER ENDPOINTS ====================

@api_router.get("/user", response_model=User)
async def get_user():
    """Get or create user profile"""
    user = await db.users.find_one()
    
    if not user:
        # Create default user
        user_data = User().dict(exclude={'id'})
        result = await db.users.insert_one(user_data)
        user = await db.users.find_one({'_id': result.inserted_id})
        
        # Create default skills
        default_skills = [
            "Здоровье", "Интеллект", "Дисциплина", 
            "Финансы", "Коммуникация", "Креативность"
        ]
        for skill_name in default_skills:
            skill_data = Skill(name=skill_name, isDefault=True).dict(exclude={'id'})
            await db.skills.insert_one(skill_data)
    
    user['id'] = str(user['_id'])
    return User(**user)

@api_router.put("/user/nickname", response_model=User)
async def update_nickname(nickname_data: UserUpdateNickname):
    """Update user nickname"""
    user = await db.users.find_one()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.update_one(
        {'_id': user['_id']},
        {'$set': {'nickname': nickname_data.nickname}}
    )
    
    updated_user = await db.users.find_one({'_id': user['_id']})
    updated_user['id'] = str(updated_user['_id'])

@api_router.post("/user/reset-progress")
async def reset_user_progress():
    """Reset user progress to level 0"""
    user = await db.users.find_one()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Reset user to level 0
    await db.users.update_one(
        {'_id': user['_id']},
        {'$set': {
            'level': 0,
            'currentXP': 0,
            'xpToNextLevel': 100,
            'totalXP': 0
        }}
    )
    
    # Reset all skills to level 0
    await db.skills.update_many(
        {},
        {'$set': {
            'level': 0,
            'currentXP': 0,
            'xpToNextLevel': 100
        }}
    )
    
    updated_user = await db.users.find_one({'_id': user['_id']})
    updated_user['id'] = str(updated_user['_id'])
    return {"message": "Progress reset successfully", "user": User(**updated_user)}

    return User(**updated_user)


@api_router.post("/user/reset-daily")
async def reset_daily_missions():
    """Reset all daily missions"""
    today = datetime.utcnow().date()
    
    # Find all daily missions
    daily_missions = await db.missions.find({'type': 'daily'}).to_list(1000)
    
    for mission in daily_missions:
        last_reset = mission.get('lastResetDate')
        
        # Check if mission needs reset
        if not last_reset or last_reset.date() < today:
            # Reset mission and all tasks/steps
            for task in mission.get('tasks', []):
                task['isCompleted'] = False
                for step in task.get('steps', []):
                    step['isCompleted'] = False
            
            await db.missions.update_one(
                {'_id': mission['_id']},
                {'$set': {
                    'isCompleted': False,
                    'completedAt': None,
                    'lastResetDate': datetime.utcnow(),
                    'tasks': mission['tasks']
                }}
            )
    
    # Update user's last daily reset
    await db.users.update_one(
        {},
        {'$set': {'lastDailyReset': datetime.utcnow()}}
    )
    
    return {"message": "Daily missions reset successfully"}

# ==================== SKILLS ENDPOINTS ====================

@api_router.get("/skills", response_model=List[Skill])
async def get_skills():
    """Get all skills"""
    skills = await db.skills.find().sort('createdAt', 1).to_list(1000)
    for skill in skills:
        skill['id'] = str(skill['_id'])
    return [Skill(**skill) for skill in skills]

@api_router.post("/skills", response_model=Skill)
async def create_skill(skill_input: SkillCreate):
    """Create a new custom skill"""
    skill_data = Skill(name=skill_input.name, isDefault=False).dict(exclude={'id'})
    result = await db.skills.insert_one(skill_data)
    skill = await db.skills.find_one({'_id': result.inserted_id})
    skill['id'] = str(skill['_id'])
    return Skill(**skill)

@api_router.delete("/skills/{skill_id}")
async def delete_skill(skill_id: str):
    """Delete a custom skill"""
    skill = await db.skills.find_one({'_id': ObjectId(skill_id)})
    
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    
    if skill.get('isDefault', False):
        raise HTTPException(status_code=400, detail="Cannot delete default skills")
    
    await db.skills.delete_one({'_id': ObjectId(skill_id)})
    return {"message": "Skill deleted successfully"}

# ==================== MISSIONS ENDPOINTS ====================

@api_router.get("/missions", response_model=List[Mission])
async def get_missions():
    """Get all missions"""
    missions = await db.missions.find().sort('createdAt', -1).to_list(1000)
    for mission in missions:
        mission['id'] = str(mission['_id'])
    return [Mission(**mission) for mission in missions]

@api_router.get("/missions/{mission_id}", response_model=Mission)
async def get_mission(mission_id: str):
    """Get a specific mission"""
    try:
        mission = await db.missions.find_one({'_id': ObjectId(mission_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Invalid mission ID")
    
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    
    mission['id'] = str(mission['_id'])
    return Mission(**mission)

@api_router.post("/missions", response_model=Mission)
async def create_mission(mission_input: MissionCreate):
    """Create a new mission"""
    mission_data = mission_input.dict()
    mission_data['isCompleted'] = False
    mission_data['completedAt'] = None
    mission_data['createdAt'] = datetime.utcnow()
    mission_data['lastResetDate'] = datetime.utcnow() if mission_input.type == 'daily' else None
    
    result = await db.missions.insert_one(mission_data)
    mission = await db.missions.find_one({'_id': result.inserted_id})
    mission['id'] = str(mission['_id'])
    return Mission(**mission)

@api_router.delete("/missions/{mission_id}")
async def delete_mission(mission_id: str):
    """Delete a mission"""
    result = await db.missions.delete_one({'_id': ObjectId(mission_id)})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Mission not found")
    
    return {"message": "Mission deleted successfully"}

@api_router.put("/missions/{mission_id}", response_model=Mission)
async def update_mission(mission_id: str, mission_update: MissionUpdate):
    """Update an existing mission"""
    mission = await db.missions.find_one({'_id': ObjectId(mission_id)})
    
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    
    update_data = mission_update.dict(exclude_unset=True)
    
    if update_data:
        await db.missions.update_one(
            {'_id': ObjectId(mission_id)},
            {'$set': update_data}
        )
    
    updated_mission = await db.missions.find_one({'_id': ObjectId(mission_id)})
    updated_mission['id'] = str(updated_mission['_id'])
    return Mission(**updated_mission)


# ==================== COMPLETION ENDPOINTS ====================

@api_router.post("/complete/step/{mission_id}/{task_idx}/{step_idx}")
async def complete_step(mission_id: str, task_idx: int, step_idx: int):
    """Complete a step and trigger XP rewards"""
    mission = await db.missions.find_one({'_id': ObjectId(mission_id)})
    
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    
    if mission.get('isCompleted', False):
        raise HTTPException(status_code=400, detail="Mission already completed")
    
    tasks = mission.get('tasks', [])
    
    if task_idx >= len(tasks):
        raise HTTPException(status_code=404, detail="Task not found")
    
    task = tasks[task_idx]
    steps = task.get('steps', [])
    
    if step_idx >= len(steps):
        raise HTTPException(status_code=404, detail="Step not found")
    
    step = steps[step_idx]
    
    if step.get('isCompleted', False):
        raise HTTPException(status_code=400, detail="Step already completed")
    
    # Mark step as completed
    step['isCompleted'] = True
    step['lastCompletedDate'] = datetime.utcnow()
    
    # Update user stats
    user = await db.users.find_one()
    await db.users.update_one(
        {'_id': user['_id']},
        {'$inc': {'totalStepsCompleted': 1}}
    )
    
    # Check if this is a daily task/step and update streak
    if step.get('isDaily', False) or task.get('isDaily', False):
        await update_streak()
    
    # Award XP for step
    await add_xp_to_user(step['xpReward'])
    
    # Check if all steps in task are completed
    all_steps_done = all(s.get('isCompleted', False) for s in steps)
    
    if all_steps_done and not task.get('isCompleted', False):
        # Complete the task
        task['isCompleted'] = True
        task['lastCompletedDate'] = datetime.utcnow()
        await add_xp_to_user(task['xpReward'])
        
        # Update task stats
        await db.users.update_one(
            {'_id': user['_id']},
            {'$inc': {'totalTasksCompleted': 1}}
        )
        
        # Check if all tasks in mission are completed
        all_tasks_done = all(t.get('isCompleted', False) for t in tasks)
        
        if all_tasks_done and not mission.get('isCompleted', False):
            # Complete the mission
            mission['isCompleted'] = True
            mission['completedAt'] = datetime.utcnow()
            
            # Get streak multiplier for mission reward
            user = await db.users.find_one()
            multiplier = get_streak_multiplier(user.get('streak', 0))
            mission_xp = int(mission['totalXPReward'] * multiplier)
            
            # Award mission XP to user with multiplier
            await add_xp_to_user(mission_xp)
            
            # Award XP to skills (also with multiplier)
            for skill_reward in mission.get('skillRewards', []):
                skill_xp = int(skill_reward['xpAmount'] * multiplier)
                await add_xp_to_skill(skill_reward['skillId'], skill_xp)
            
            # Update mission stats
            await db.users.update_one(
                {'_id': user['_id']},
                {'$inc': {'totalMissionsCompleted': 1}}
            )
    
    # Update mission in database
    await db.missions.update_one(
        {'_id': ObjectId(mission_id)},
        {'$set': {
            'tasks': tasks,
            'isCompleted': mission.get('isCompleted', False),
            'completedAt': mission.get('completedAt')
        }}
    )
    
    # Get updated user and mission
    updated_user = await db.users.find_one()
    updated_mission = await db.missions.find_one({'_id': ObjectId(mission_id)})
    
    updated_user['id'] = str(updated_user['_id'])
    updated_mission['id'] = str(updated_mission['_id'])
    
    return {
        "message": "Step completed successfully",
        "user": User(**updated_user),
        "mission": Mission(**updated_mission)
    }

# ==================== UNCOMPLETE ENDPOINTS ====================

@api_router.post("/uncomplete/step/{mission_id}/{task_idx}/{step_idx}")
async def uncomplete_step(mission_id: str, task_idx: int, step_idx: int):
    """Uncomplete a step (remove checkmark)"""
    mission = await db.missions.find_one({'_id': ObjectId(mission_id)})
    
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    
    tasks = mission.get('tasks', [])
    
    if task_idx >= len(tasks):
        raise HTTPException(status_code=404, detail="Task not found")
    
    task = tasks[task_idx]
    steps = task.get('steps', [])
    
    if step_idx >= len(steps):
        raise HTTPException(status_code=404, detail="Step not found")
    
    step = steps[step_idx]
    
    if not step.get('isCompleted', False):
        raise HTTPException(status_code=400, detail="Step is not completed")
    
    # Mark step as uncompleted
    step['isCompleted'] = False
    step['lastCompletedDate'] = None
    
    # If task was completed, uncomplete it
    if task.get('isCompleted', False):
        task['isCompleted'] = False
        task['lastCompletedDate'] = None
        # Remove task XP
        await add_xp_to_user(-task['xpReward'])
        
        user = await db.users.find_one()
        await db.users.update_one(
            {'_id': user['_id']},
            {'$inc': {'totalTasksCompleted': -1}}
        )
    
    # If mission was completed, uncomplete it
    if mission.get('isCompleted', False):
        mission['isCompleted'] = False
        mission['completedAt'] = None
        
        # Remove mission XP and skill XP (with multiplier)
        user = await db.users.find_one()
        multiplier = get_streak_multiplier(user.get('streak', 0))
        mission_xp = int(mission['totalXPReward'] * multiplier)
        await add_xp_to_user(-mission_xp)
        
        for skill_reward in mission.get('skillRewards', []):
            skill_xp = int(skill_reward['xpAmount'] * multiplier)
            await add_xp_to_skill(skill_reward['skillId'], -skill_xp)
        
        await db.users.update_one(
            {'_id': user['_id']},
            {'$inc': {'totalMissionsCompleted': -1}}
        )
    
    # Remove step XP
    await add_xp_to_user(-step['xpReward'])
    
    user = await db.users.find_one()
    await db.users.update_one(
        {'_id': user['_id']},
        {'$inc': {'totalStepsCompleted': -1}}
    )
    
    # Update mission in database
    await db.missions.update_one(
        {'_id': ObjectId(mission_id)},
        {'$set': {
            'tasks': tasks,
            'isCompleted': mission.get('isCompleted', False),
            'completedAt': mission.get('completedAt')
        }}
    )
    
    # Get updated data
    updated_user = await db.users.find_one()
    updated_mission = await db.missions.find_one({'_id': ObjectId(mission_id)})
    
    updated_user['id'] = str(updated_user['_id'])
    updated_mission['id'] = str(updated_mission['_id'])
    
    return {
        "message": "Step uncompleted successfully",
        "user": User(**updated_user),
        "mission": Mission(**updated_mission)
    }

@api_router.post("/complete/task/{mission_id}/{task_idx}")
async def complete_task_without_steps(mission_id: str, task_idx: int):
    """Complete a task that has no steps"""
    mission = await db.missions.find_one({'_id': ObjectId(mission_id)})
    
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    
    if mission.get('isCompleted', False):
        raise HTTPException(status_code=400, detail="Mission already completed")
    
    tasks = mission.get('tasks', [])
    
    if task_idx >= len(tasks):
        raise HTTPException(status_code=404, detail="Task not found")
    
    task = tasks[task_idx]
    
    if task.get('isCompleted', False):
        raise HTTPException(status_code=400, detail="Task already completed")
    
    # Check if task has steps
    if len(task.get('steps', [])) > 0:
        raise HTTPException(status_code=400, detail="Task has steps, complete them first")
    
    # Complete the task
    task['isCompleted'] = True
    task['lastCompletedDate'] = datetime.utcnow()
    
    user = await db.users.find_one()
    
    # Update streak if daily
    if task.get('isDaily', False):
        await update_streak()
    
    # Award task XP
    await add_xp_to_user(task['xpReward'])
    
    # Update stats
    await db.users.update_one(
        {'_id': user['_id']},
        {'$inc': {'totalTasksCompleted': 1}}
    )
    
    # Check if all tasks completed
    all_tasks_done = all(t.get('isCompleted', False) for t in tasks)
    
    if all_tasks_done:
        mission['isCompleted'] = True
        mission['completedAt'] = datetime.utcnow()
        
        # Get streak multiplier
        user = await db.users.find_one()
        multiplier = get_streak_multiplier(user.get('streak', 0))
        mission_xp = int(mission['totalXPReward'] * multiplier)
        
        # Award mission XP with multiplier
        await add_xp_to_user(mission_xp)
        
        # Award skill XP with multiplier
        for skill_reward in mission.get('skillRewards', []):
            skill_xp = int(skill_reward['xpAmount'] * multiplier)
            await add_xp_to_skill(skill_reward['skillId'], skill_xp)
        
        # Update mission stats
        await db.users.update_one(
            {'_id': user['_id']},
            {'$inc': {'totalMissionsCompleted': 1}}
        )
    
    # Update mission
    await db.missions.update_one(
        {'_id': ObjectId(mission_id)},
        {'$set': {
            'tasks': tasks,
            'isCompleted': mission.get('isCompleted', False),
            'completedAt': mission.get('completedAt')
        }}
    )
    
    # Get updated data
    updated_user = await db.users.find_one()
    updated_mission = await db.missions.find_one({'_id': ObjectId(mission_id)})
    
    updated_user['id'] = str(updated_user['_id'])
    updated_mission['id'] = str(updated_mission['_id'])
    
    return {
        "message": "Task completed successfully",
        "user": User(**updated_user),
        "mission": Mission(**updated_mission)
    }

# ==================== REWARDS ENDPOINTS ====================

@api_router.get("/rewards", response_model=List[Reward])
async def get_rewards():
    """Get all rewards"""
    rewards = await db.rewards.find().sort('createdAt', -1).to_list(1000)
    for reward in rewards:
        reward['id'] = str(reward['_id'])
    return [Reward(**reward) for reward in rewards]

@api_router.post("/rewards", response_model=Reward)
async def create_reward(reward_input: RewardCreate):
    """Create a new reward"""
    reward_data = Reward(**reward_input.dict()).dict(exclude={'id'})
    result = await db.rewards.insert_one(reward_data)
    reward = await db.rewards.find_one({'_id': result.inserted_id})
    reward['id'] = str(reward['_id'])
    return Reward(**reward)

@api_router.delete("/rewards/{reward_id}")
async def delete_reward(reward_id: str):
    """Delete a reward"""
    result = await db.rewards.delete_one({'_id': ObjectId(reward_id)})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Reward not found")
    
    return {"message": "Reward deleted successfully"}

@api_router.post("/rewards/{reward_id}/purchase")
async def purchase_reward(reward_id: str):
    """Purchase a reward with XP"""
    reward = await db.rewards.find_one({'_id': ObjectId(reward_id)})
    
    if not reward:
        raise HTTPException(status_code=404, detail="Reward not found")
    
    if reward.get('isPurchased', False):
        raise HTTPException(status_code=400, detail="Reward already purchased")
    
    user = await db.users.find_one()
    
    if user['currentXP'] + user.get('totalXP', 0) < reward['xpCost']:
        raise HTTPException(status_code=400, detail="Not enough XP")
    
    # Deduct XP from user (from total, not current level XP)
    xp_to_deduct = reward['xpCost']
    
    # Deduct from current XP first
    if user['currentXP'] >= xp_to_deduct:
        await db.users.update_one(
            {'_id': user['_id']},
            {'$inc': {'currentXP': -xp_to_deduct}}
        )
    else:
        # Not enough in current, need to reduce total and potentially level
        await db.users.update_one(
            {'_id': user['_id']},
            {'$inc': {'totalXP': -xp_to_deduct, 'currentXP': -xp_to_deduct}}
        )
        
        # Recalculate level based on new total XP
        user = await db.users.find_one()
        new_total_xp = user['totalXP']
        new_level = 0
        xp_sum = 0
        
        while xp_sum + calculate_xp_for_level(new_level + 1) <= new_total_xp:
            new_level += 1
            xp_sum += calculate_xp_for_level(new_level)
        
        new_current_xp = new_total_xp - xp_sum
        new_xp_to_next = calculate_xp_for_level(new_level + 1)
        
        await db.users.update_one(
            {'_id': user['_id']},
            {'$set': {
                'level': new_level,
                'currentXP': new_current_xp,
                'xpToNextLevel': new_xp_to_next
            }}
        )
    
    # Mark reward as purchased
    await db.rewards.update_one(
        {'_id': ObjectId(reward_id)},
        {'$set': {
            'isPurchased': True,
            'purchasedAt': datetime.utcnow()
        }}
    )
    
    updated_user = await db.users.find_one()
    updated_reward = await db.rewards.find_one({'_id': ObjectId(reward_id)})
    
    updated_user['id'] = str(updated_user['_id'])
    updated_reward['id'] = str(updated_reward['_id'])
    
    return {
        "message": "Reward purchased successfully",
        "user": User(**updated_user),
        "reward": Reward(**updated_reward)
    }

# ==================== STATISTICS ENDPOINTS ====================

@api_router.get("/statistics")
async def get_statistics():
    """Get user statistics"""
    user = await db.users.find_one()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get missions stats
    total_missions = await db.missions.count_documents({})
    completed_missions = await db.missions.count_documents({'isCompleted': True})
    active_missions = total_missions - completed_missions
    
    # Get daily missions stats
    daily_missions_total = await db.missions.count_documents({'type': 'daily'})
    daily_missions_completed = await db.missions.count_documents({'type': 'daily', 'isCompleted': True})
    
    # Get skills stats
    skills = await db.skills.find().to_list(1000)
    total_skill_levels = sum(skill.get('level', 0) for skill in skills)
    avg_skill_level = total_skill_levels / len(skills) if skills else 0
    
    # Get rewards stats
    total_rewards = await db.rewards.count_documents({})
    purchased_rewards = await db.rewards.count_documents({'isPurchased': True})
    
    return {
        "user": {
            "level": user.get('level', 0),
            "totalXP": user.get('totalXP', 0),
            "streak": user.get('streak', 0),
            "longestStreak": user.get('longestStreak', 0),
            "totalMissionsCompleted": user.get('totalMissionsCompleted', 0),
            "totalTasksCompleted": user.get('totalTasksCompleted', 0),
            "totalStepsCompleted": user.get('totalStepsCompleted', 0),
        },
        "missions": {
            "total": total_missions,
            "completed": completed_missions,
            "active": active_missions,
            "dailyTotal": daily_missions_total,
            "dailyCompleted": daily_missions_completed,
        },
        "skills": {
            "total": len(skills),
            "totalLevels": total_skill_levels,
            "averageLevel": round(avg_skill_level, 2),
        },
        "rewards": {
            "total": total_rewards,
            "purchased": purchased_rewards,
            "available": total_rewards - purchased_rewards,
        }
    }

# ==================== BASIC ENDPOINTS ====================

@api_router.get("/")
async def root():
    return {"message": "RPG Life Gamification API"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

---

# Frontend Structure

## Структура файлов:
```
frontend/
├── app/
│   ├── (tabs)/          # Главные экраны с навигацией
│   │   ├── _layout.tsx
│   │   ├── index.tsx    # Главная страница
│   │   ├── missions.tsx
│   │   ├── skills.tsx
│   │   ├── rewards.tsx
│   │   └── statistics.tsx
│   ├── missions/
│   │   ├── [id].tsx     # Детали миссии
│   │   ├── create.tsx   # Создание миссии
│   │   └── edit/
│   │       └── [id].tsx # Редактирование миссии
│   ├── _layout.tsx      # Root layout
│   └── index.tsx        # Entry point
├── components/
│   ├── MissionCard.tsx
│   ├── ProgressBar.tsx
│   └── SkillCard.tsx
├── contexts/
│   └── AppContext.tsx
└── utils/
    ├── api.ts
    ├── levelSystem.ts
    └── types.ts
```

---

# Frontend Utils

## /app/frontend/utils/types.ts

export interface User {
  id?: string;
  nickname: string;
  level: number;
  currentXP: number;
  xpToNextLevel: number;
  totalXP: number;
  lastDailyReset?: string;
  streak: number;
  lastStreakDate?: string;
  longestStreak: number;
  totalMissionsCompleted: number;
  totalTasksCompleted: number;
  totalStepsCompleted: number;
}

export interface Skill {
  id?: string;
  name: string;
  level: number;
  currentXP: number;
  xpToNextLevel: number;
  isDefault: boolean;
  createdAt?: string;
}

export interface Step {
  title: string;
  xpReward: number;
  isCompleted: boolean;
  isDaily?: boolean;
  lastCompletedDate?: string;
}

export interface Task {
  title: string;
  xpReward: number;
  steps: Step[];
  isCompleted: boolean;
  isDaily?: boolean;
  lastCompletedDate?: string;
}

export interface SkillReward {
  skillId: string;
  xpAmount: number;
}

export interface Mission {
  id?: string;
  title: string;
  description: string;
  type: 'main' | 'side' | 'daily';
  totalXPReward: number;
  skillRewards: SkillReward[];
  tasks: Task[];
  isCompleted: boolean;
  completedAt?: string;
  createdAt?: string;
  lastResetDate?: string;
}

export interface Reward {
  id?: string;
  title: string;
  description: string;
  xpCost: number;
  isPurchased: boolean;
  purchasedAt?: string;
  createdAt?: string;
}

## /app/frontend/utils/api.ts

import axios from 'axios';
import Constants from 'expo-constants';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL || '';

const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// User APIs
export const getUser = () => api.get('/user');
export const updateNickname = (nickname: string) => api.put('/user/nickname', { nickname });
export const resetDailyMissions = () => api.post('/user/reset-daily');

// Skills APIs
export const getSkills = () => api.get('/skills');
export const createSkill = (name: string) => api.post('/skills', { name });
export const deleteSkill = (skillId: string) => api.delete(`/skills/${skillId}`);

// Missions APIs
export const getMissions = () => api.get('/missions');
export const getMission = (missionId: string) => api.get(`/missions/${missionId}`);
export const createMission = (missionData: any) => api.post('/missions', missionData);
export const updateMission = (missionId: string, missionData: any) => api.put(`/missions/${missionId}`, missionData);
export const deleteMission = (missionId: string) => api.delete(`/missions/${missionId}`);

// Completion APIs
export const completeStep = (missionId: string, taskIdx: number, stepIdx: number) => 
  api.post(`/complete/step/${missionId}/${taskIdx}/${stepIdx}`);
export const completeTask = (missionId: string, taskIdx: number) => 
  api.post(`/complete/task/${missionId}/${taskIdx}`);
export const uncompleteStep = (missionId: string, taskIdx: number, stepIdx: number) => 
  api.post(`/uncomplete/step/${missionId}/${taskIdx}/${stepIdx}`);

// Rewards APIs
export const getRewards = () => api.get('/rewards');
export const createReward = (rewardData: { title: string; description: string; xpCost: number }) => 
  api.post('/rewards', rewardData);
export const deleteReward = (rewardId: string) => api.delete(`/rewards/${rewardId}`);
export const purchaseReward = (rewardId: string) => api.post(`/rewards/${rewardId}/purchase`);

// Statistics API
export const getStatistics = () => api.get('/statistics');

export default api;

## /app/frontend/utils/levelSystem.ts

// Level system utilities

export interface LevelInfo {
  title: string;
  icon: string;
  color: string;
}

export const getLevelInfo = (level: number): LevelInfo => {
  if (level === 0) {
    return {
      title: 'Новичок',
      icon: '🌱',
      color: '#95E1D3'
    };
  } else if (level >= 1 && level <= 10) {
    return {
      title: 'Человек, который что-то начал',
      icon: '🚶',
      color: '#4ECDC4'
    };
  } else if (level >= 11 && level <= 20) {
    return {
      title: 'Юный Падаван',
      icon: '⚔️',
      color: '#45B7D1'
    };
  } else if (level >= 21 && level <= 30) {
    return {
      title: 'Воин Кунг-фу',
      icon: '🥋',
      color: '#96CEB4'
    };
  } else if (level >= 31 && level <= 40) {
    return {
      title: 'Машина',
      icon: '🤖',
      color: '#FFEAA7'
    };
  } else if (level >= 41 && level <= 50) {
    return {
      title: 'Волк с Уолл-Стрит',
      icon: '🐺',
      color: '#DFE6E9'
    };
  } else if (level >= 51 && level <= 60) {
    return {
      title: 'Монстр эффективности',
      icon: '👹',
      color: '#A29BFE'
    };
  } else if (level >= 61 && level <= 70) {
    return {
      title: 'Бог дисциплины',
      icon: '⚡',
      color: '#FD79A8'
    };
  } else if (level >= 71 && level <= 80) {
    return {
      title: 'Гранд-мастер',
      icon: '👑',
      color: '#FDCB6E'
    };
  } else if (level >= 81 && level <= 99) {
    return {
      title: 'Легенда',
      icon: '🔥',
      color: '#E17055'
    };
  } else {
    return {
      title: 'Рыцарь Готэма',
      icon: '🦇',
      color: '#2D3436'
    };
  }
};

export const getNextLevelThreshold = (level: number): number => {
  if (level === 0) return 1;
  if (level < 10) return 10;
  if (level < 20) return 20;
  if (level < 30) return 30;
  if (level < 40) return 40;
  if (level < 50) return 50;
  if (level < 60) return 60;
  if (level < 70) return 70;
  if (level < 80) return 80;
  if (level < 100) return 100;
  return level + 10;
};

---

# Frontend Contexts

## /app/frontend/contexts/AppContext.tsx

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Skill, Mission } from '../utils/types';
import * as api from '../utils/api';

interface AppContextType {
  user: User | null;
  skills: Skill[];
  missions: Mission[];
  loading: boolean;
  refreshUser: () => Promise<void>;
  refreshSkills: () => Promise<void>;
  refreshMissions: () => Promise<void>;
  refreshAll: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const response = await api.getUser();
      setUser(response.data);
    } catch (error) {
      console.error('Error fetching user:', error);
    }
  };

  const refreshSkills = async () => {
    try {
      const response = await api.getSkills();
      setSkills(response.data);
    } catch (error) {
      console.error('Error fetching skills:', error);
    }
  };

  const refreshMissions = async () => {
    try {
      const response = await api.getMissions();
      setMissions(response.data);
      
      // Auto-reset daily missions if needed
      await api.resetDailyMissions();
    } catch (error) {
      console.error('Error fetching missions:', error);
    }
  };

  const refreshAll = async () => {
    setLoading(true);
    await Promise.all([
      refreshUser(),
      refreshSkills(),
      refreshMissions()
    ]);
    setLoading(false);
  };

  useEffect(() => {
    refreshAll();
  }, []);

  return (
    <AppContext.Provider value={{
      user,
      skills,
      missions,
      loading,
      refreshUser,
      refreshSkills,
      refreshMissions,
      refreshAll
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

---

# Frontend Components

## MissionCard.tsx

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Mission } from '../utils/types';
import { ProgressBar } from './ProgressBar';

interface MissionCardProps {
  mission: Mission;
  onPress: () => void;
}

export const MissionCard = ({ mission, onPress }: MissionCardProps) => {
  const totalTasks = mission.tasks.length;
  const completedTasks = mission.tasks.filter(t => t.isCompleted).length;
  
  const getMissionTypeColor = () => {
    switch (mission.type) {
      case 'main': return '#FF6B6B';
      case 'daily': return '#4ECDC4';
      case 'side': return '#95E1D3';
      default: return '#FFD700';
    }
  };

  const getMissionTypeLabel = () => {
    switch (mission.type) {
      case 'main': return 'Основная';
      case 'daily': return 'Ежедневная';
      case 'side': return 'Дополнительная';
      default: return mission.type;
    }
  };

  return (
    <TouchableOpacity 
      style={[styles.card, mission.isCompleted && styles.completedCard]} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>{mission.title}</Text>
        <View style={[styles.typeBadge, { backgroundColor: getMissionTypeColor() }]}>
          <Text style={styles.typeText}>{getMissionTypeLabel()}</Text>
        </View>
      </View>
      
      {mission.description && (
        <Text style={styles.description} numberOfLines={2}>{mission.description}</Text>
      )}
      
      <View style={styles.progressSection}>
        <Text style={styles.progressText}>
          Задачи: {completedTasks} / {totalTasks}
        </Text>
        <ProgressBar 
          current={completedTasks} 
          max={totalTasks} 
          height={8}
          showLabel={false}
        />
      </View>
      
      <View style={styles.footer}>
        <Text style={styles.xpText}>+{mission.totalXPReward} XP</Text>
        {mission.isCompleted && (
          <Text style={styles.completedText}>✓ Завершена</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  completedCard: {
    opacity: 0.6,
    borderColor: '#4CAF50',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    marginRight: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  description: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 12,
  },
  progressSection: {
    marginBottom: 12,
  },
  progressText: {
    color: '#ddd',
    fontSize: 12,
    marginBottom: 6,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  xpText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
  },
  completedText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

## ProgressBar.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface ProgressBarProps {
  current: number;
  max: number;
  color?: string;
  height?: number;
  showLabel?: boolean;
}

export const ProgressBar = ({ 
  current, 
  max, 
  color = '#FFD700', 
  height = 20,
  showLabel = true 
}: ProgressBarProps) => {
  const percentage = Math.min((current / max) * 100, 100);

  return (
    <View style={styles.container}>
      <View style={[styles.barContainer, { height }]}>
        <View 
          style={[
            styles.barFill, 
            { width: `${percentage}%`, backgroundColor: color }
          ]} 
        />
        {showLabel && (
          <Text style={styles.label}>
            {current} / {max}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  barContainer: {
    width: '100%',
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  barFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 10,
  },
  label: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    zIndex: 1,
  },
});

## SkillCard.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Skill } from '../utils/types';
import { ProgressBar } from './ProgressBar';

interface SkillCardProps {
  skill: Skill;
}

export const SkillCard = ({ skill }: SkillCardProps) => {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.name}>{skill.name}</Text>
        <View style={styles.levelBadge}>
          <Text style={styles.levelText}>Ур. {skill.level}</Text>
        </View>
      </View>
      
      <View style={styles.progressSection}>
        <ProgressBar 
          current={skill.currentXP} 
          max={skill.xpToNextLevel}
          color="#8B5CF6"
          height={16}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  levelBadge: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  levelText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  progressSection: {
    marginTop: 4,
  },
});

---

# Frontend Screens

## _layout.tsx

import React from 'react';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#FFD700',
        tabBarInactiveTintColor: '#666',
        tabBarStyle: {
          backgroundColor: '#1a1a1a',
          borderTopColor: '#333',
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Главная',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 24, color }}>🏠</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="missions"
        options={{
          title: 'Миссии',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 24, color }}>🎯</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="skills"
        options={{
          title: 'Навыки',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 24, color }}>📈</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="rewards"
        options={{
          title: 'Награды',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 24, color }}>🎁</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="statistics"
        options={{
          title: 'Статистика',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 24, color }}>📊</Text>
          ),
        }}
      />
    </Tabs>
  );
}

## index.tsx

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, TextInput, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../contexts/AppContext';
import { ProgressBar } from '../../components/ProgressBar';
import { MissionCard } from '../../components/MissionCard';
import { SkillCard } from '../../components/SkillCard';
import { useRouter } from 'expo-router';
import { getLevelInfo } from '../../utils/levelSystem';
import * as api from '../../utils/api';

export default function HomeScreen() {
  const { user, missions, skills, loading, refreshAll } = useApp();
  const router = useRouter();
  const [editingNickname, setEditingNickname] = useState(false);
  const [newNickname, setNewNickname] = useState('');

  const activeMissions = missions.filter(m => !m.isCompleted).slice(0, 3);
  const topSkills = skills.slice(0, 3);

  // Get today's tasks from daily missions
  const todayTasks = missions
    .filter(m => m.type === 'daily' && !m.isCompleted)
    .flatMap(m => m.tasks.filter(t => !t.isCompleted))
    .slice(0, 5);

  const levelInfo = getLevelInfo(user?.level || 0);

  const handleUpdateNickname = async () => {
    if (!newNickname.trim()) {
      Alert.alert('Ошибка', 'Введите никнейм');
      return;
    }

    try {
      await api.updateNickname(newNickname.trim());
      await refreshAll();
      setEditingNickname(false);
      setNewNickname('');
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось обновить никнейм');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView 
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refreshAll} />
        }
      >
        <View style={styles.content}>
          {/* User Level Section */}
          <View style={styles.userSection}>
            {/* Level Icon as Avatar */}
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarIcon}>{levelInfo.icon}</Text>
            </View>
            
            {/* User Info */}
            <TouchableOpacity 
              onPress={() => {
                setNewNickname(user?.nickname || 'Игрок');
                setEditingNickname(true);
              }}
              style={styles.userInfoContainer}
            >
              <Text style={styles.userNickname}>{user?.nickname || 'Игрок'}</Text>
              <Text style={styles.levelTitle}>{levelInfo.title}</Text>
            </TouchableOpacity>

            <View style={[styles.levelBadge, { backgroundColor: levelInfo.color }]}>
              <Text style={styles.levelText}>Уровень {user?.level || 0}</Text>
            </View>
            
            <View style={styles.xpSection}>
              <Text style={styles.xpLabel}>Опыт</Text>
              <ProgressBar 
                current={user?.currentXP || 0}
                max={user?.xpToNextLevel || 100}
                color={levelInfo.color}
                height={24}
              />
            </View>
            <Text style={styles.totalXP}>
              Всего XP: {user?.totalXP || 0}
            </Text>
            
            {/* Streak Section */}
            {(user?.streak || 0) > 0 && (
              <View style={styles.streakSection}>
                <Text style={styles.streakText}>
                  🔥 Серия: {user?.streak} {user?.streak === 1 ? 'день' : 'дней'}
                </Text>
                {(user?.streak || 0) >= 10 && (
                  <Text style={styles.streakBonus}>
                    Бонус XP: x{(() => {
                      const s = user?.streak || 0;
                      if (s >= 100) return 40;
                      if (s >= 66) return 30;
                      if (s >= 42) return 20;
                      if (s >= 31) return 10;
                      if (s >= 21) return 10;
                      return 5;
                    })()}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Today's Tasks */}
          {todayTasks.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Задачи на сегодня</Text>
              {todayTasks.map((task, idx) => (
                <View key={idx} style={styles.taskItem}>
                  <View style={styles.taskDot} />
                  <Text style={styles.taskText}>{task.title}</Text>
                  <Text style={styles.taskXP}>+{task.xpReward} XP</Text>
                </View>
              ))}
            </View>
          )}

          {/* Active Missions */}
          {activeMissions.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Активные миссии</Text>
              {activeMissions.map(mission => (
                <MissionCard 
                  key={mission.id} 
                  mission={mission}
                  onPress={() => router.push(`/missions/${mission.id}`)}
                />
              ))}
            </View>
          )}

          {/* Skills Progress */}
          {topSkills.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Прогресс навыков</Text>
              {topSkills.map(skill => (
                <SkillCard key={skill.id} skill={skill} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Edit Nickname Modal */}
      <Modal
        visible={editingNickname}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingNickname(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Изменить никнейм</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Ваш никнейм"
              placeholderTextColor="#666"
              value={newNickname}
              onChangeText={setNewNickname}
              autoFocus
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setNewNickname('');
                  setEditingNickname(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Отмена</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleUpdateNickname}
              >
                <Text style={styles.saveButtonText}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  userSection: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#FFD700',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 3,
    borderColor: '#FFD700',
  },
  avatarIcon: {
    fontSize: 80,
  },
  userInfoContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  userNickname: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  levelIconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  levelIcon: {
    fontSize: 72,
    marginBottom: 8,
  },
  levelTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  levelBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 16,
  },
  levelText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  xpSection: {
    marginBottom: 8,
    width: '100%',
  streakSection: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    alignItems: 'center',
  },
  streakText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  streakBonus: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },
  },
  xpLabel: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 8,
  },
  totalXP: {
    color: '#FFD700',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'right',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  taskDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ECDC4',
    marginRight: 12,
  },
  taskText: {
    flex: 1,
    color: '#ddd',
    fontSize: 14,
  },
  taskXP: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#2a2a2a',
    color: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#2a2a2a',
  },
  saveButton: {
    backgroundColor: '#FFD700',
  },
  cancelButtonText: {
    color: '#aaa',
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

## missions.tsx

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../contexts/AppContext';
import { MissionCard } from '../../components/MissionCard';
import { useRouter } from 'expo-router';

export default function MissionsScreen() {
  const { missions, loading, refreshMissions } = useApp();
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'main' | 'side' | 'daily'>('all');

  const filteredMissions = filter === 'all' 
    ? missions 
    : missions.filter(m => m.type === filter);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Миссии</Text>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => router.push('/missions/create')}
        >
          <Text style={styles.addButtonText}>+ Создать</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <TouchableOpacity 
          style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            Все
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.filterButton, filter === 'main' && styles.filterButtonActive]}
          onPress={() => setFilter('main')}
        >
          <Text style={[styles.filterText, filter === 'main' && styles.filterTextActive]}>
            Основные
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.filterButton, filter === 'side' && styles.filterButtonActive]}
          onPress={() => setFilter('side')}
        >
          <Text style={[styles.filterText, filter === 'side' && styles.filterTextActive]}>
            Доп.
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.filterButton, filter === 'daily' && styles.filterButtonActive]}
          onPress={() => setFilter('daily')}
        >
          <Text style={[styles.filterText, filter === 'daily' && styles.filterTextActive]}>
            Ежедневные
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refreshMissions} />
        }
      >
        {filteredMissions.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Нет миссий</Text>
            <Text style={styles.emptySubtext}>
              Создайте свою первую миссию!
            </Text>
          </View>
        ) : (
          filteredMissions.map(mission => (
            <MissionCard 
              key={mission.id} 
              mission={mission}
              onPress={() => router.push(`/missions/${mission.id}`)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  addButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  filterButtonActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  filterText: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#000',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: 0,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#aaa',
    fontSize: 14,
  },
});

## rewards.tsx

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as api from '../../utils/api';
import { Reward } from '../../utils/types';
import { useApp } from '../../contexts/AppContext';

export default function RewardsScreen() {
  const { user, refreshUser } = useApp();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [xpCost, setXpCost] = useState('100');

  useEffect(() => {
    loadRewards();
  }, []);

  const loadRewards = async () => {
    try {
      const response = await api.getRewards();
      setRewards(response.data);
    } catch (error) {
      console.error('Error loading rewards:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Ошибка', 'Введите название награды');
      return;
    }

    try {
      await api.createReward({
        title: title.trim(),
        description: description.trim(),
        xpCost: parseInt(xpCost) || 100,
      });
      await loadRewards();
      setTitle('');
      setDescription('');
      setXpCost('100');
      setModalVisible(false);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось создать награду');
    }
  };

  const handlePurchase = async (reward: Reward) => {
    const totalXP = (user?.currentXP || 0) + (user?.totalXP || 0);
    if (totalXP < reward.xpCost) {
      Alert.alert('Недостаточно XP', `Нужно ${reward.xpCost} XP, у вас ${totalXP}`);
      return;
    }

    Alert.alert(
      'Купить награду?',
      `Потратить ${reward.xpCost} XP на "${reward.title}"?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Купить',
          onPress: async () => {
            try {
              await api.purchaseReward(reward.id!);
              await loadRewards();
              await refreshUser();
              Alert.alert('Поздравляем!', `Вы получили награду: ${reward.title}`);
            } catch (error) {
              Alert.alert('Ошибка', 'Не удалось купить награду');
            }
          },
        },
      ]
    );
  };

  const availableRewards = rewards.filter(r => !r.isPurchased);
  const purchasedRewards = rewards.filter(r => r.isPurchased);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Награды</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Text style={styles.addButtonText}>+ Создать</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.xpDisplay}>
        <Text style={styles.xpText}>Доступно XP: {(user?.currentXP || 0) + (user?.totalXP || 0)}</Text>
      </View>

      <ScrollView style={styles.scrollView} refreshControl={<RefreshControl refreshing={loading} onRefresh={loadRewards} />}>
        {availableRewards.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Доступные</Text>
            {availableRewards.map(reward => (
              <TouchableOpacity key={reward.id} style={styles.rewardCard} onPress={() => handlePurchase(reward)}>
                <View style={styles.rewardHeader}>
                  <Text style={styles.rewardTitle}>{reward.title}</Text>
                  <Text style={styles.rewardCost}>{reward.xpCost} XP</Text>
                </View>
                {reward.description && <Text style={styles.rewardDescription}>{reward.description}</Text>}
                <View style={styles.buyButton}>
                  <Text style={styles.buyButtonText}>Купить</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {purchasedRewards.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Получено</Text>
            {purchasedRewards.map(reward => (
              <View key={reward.id} style={[styles.rewardCard, styles.purchasedCard]}>
                <View style={styles.rewardHeader}>
                  <Text style={styles.rewardTitle}>{reward.title} ✓</Text>
                </View>
                {reward.description && <Text style={styles.rewardDescription}>{reward.description}</Text>}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Новая награда</Text>
            <TextInput style={styles.input} placeholder="Название" placeholderTextColor="#666" value={title} onChangeText={setTitle} />
            <TextInput style={[styles.input, styles.textArea]} placeholder="Описание" placeholderTextColor="#666" value={description} onChangeText={setDescription} multiline />
            <TextInput style={styles.input} placeholder="Стоимость в XP" placeholderTextColor="#666" value={xpCost} onChangeText={setXpCost} keyboardType="numeric" />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.createButton]} onPress={handleCreate}>
                <Text style={styles.createButtonText}>Создать</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 8 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  addButton: { backgroundColor: '#FFD700', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  addButtonText: { color: '#000', fontSize: 14, fontWeight: 'bold' },
  xpDisplay: { backgroundColor: '#1a1a1a', padding: 16, marginHorizontal: 16, marginBottom: 16, borderRadius: 12 },
  xpText: { color: '#FFD700', fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  scrollView: { flex: 1 },
  section: { padding: 16 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 12 },
  rewardCard: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#333' },
  purchasedCard: { opacity: 0.6, borderColor: '#4CAF50' },
  rewardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  rewardTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', flex: 1 },
  rewardCost: { color: '#FFD700', fontSize: 16, fontWeight: 'bold' },
  rewardDescription: { color: '#aaa', fontSize: 14, marginBottom: 12 },
  buyButton: { backgroundColor: '#4CAF50', padding: 10, borderRadius: 8, alignItems: 'center' },
  buyButtonText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1a1a1a', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 20 },
  input: { backgroundColor: '#2a2a2a', color: '#fff', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 12, borderWidth: 1, borderColor: '#333' },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  cancelButton: { backgroundColor: '#2a2a2a' },
  createButton: { backgroundColor: '#FFD700' },
  cancelButtonText: { color: '#aaa', fontSize: 16, fontWeight: 'bold' },
  createButtonText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
});
## skills.tsx

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, TextInput, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../contexts/AppContext';
import { SkillCard } from '../../components/SkillCard';
import * as api from '../../utils/api';

export default function SkillsScreen() {
  const { skills, loading, refreshSkills } = useApp();
  const [modalVisible, setModalVisible] = useState(false);
  const [skillName, setSkillName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreateSkill = async () => {
    if (!skillName.trim()) {
      Alert.alert('Ошибка', 'Введите название навыка');
      return;
    }

    setCreating(true);
    try {
      await api.createSkill(skillName.trim());
      await refreshSkills();
      setSkillName('');
      setModalVisible(false);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось создать навык');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSkill = async (skillId: string, isDefault: boolean) => {
    if (isDefault) {
      Alert.alert('Ошибка', 'Нельзя удалить стандартный навык');
      return;
    }

    Alert.alert(
      'Удалить навык?',
      'Это действие нельзя отменить',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteSkill(skillId);
              await refreshSkills();
            } catch (error) {
              Alert.alert('Ошибка', 'Не удалось удалить навык');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Навыки</Text>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.addButtonText}>+ Добавить</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refreshSkills} />
        }
      >
        {skills.map(skill => (
          <TouchableOpacity
            key={skill.id}
            onLongPress={() => handleDeleteSkill(skill.id!, skill.isDefault)}
            activeOpacity={0.9}
          >
            <SkillCard skill={skill} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Create Skill Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Новый навык</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Название навыка"
              placeholderTextColor="#666"
              value={skillName}
              onChangeText={setSkillName}
              autoFocus
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setSkillName('');
                  setModalVisible(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Отмена</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalButton, styles.createButton]}
                onPress={handleCreateSkill}
                disabled={creating}
              >
                <Text style={styles.createButtonText}>
                  {creating ? 'Создание...' : 'Создать'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  addButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: 0,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#2a2a2a',
    color: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#2a2a2a',
  },
  createButton: {
    backgroundColor: '#8B5CF6',
  },
  cancelButtonText: {
    color: '#aaa',
    fontSize: 16,
    fontWeight: 'bold',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

## statistics.tsx

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as api from '../../utils/api';
import { ProgressBar } from '../../components/ProgressBar';

export default function StatisticsScreen() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStatistics();
  }, []);

  const loadStatistics = async () => {
    try {
      const response = await api.getStatistics();
      setStats(response.data);
    } catch (error) {
      console.error('Error loading statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!stats) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Загрузка...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Статистика</Text>
      </View>

      <ScrollView style={styles.scrollView} refreshControl={<RefreshControl refreshing={loading} onRefresh={loadStatistics} />}>
        <View style={styles.content}>
          {/* User Stats */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Общая статистика</Text>
            <View style={styles.statCard}>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Уровень:</Text>
                <Text style={styles.statValue}>{stats.user.level}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Всего XP:</Text>
                <Text style={styles.statValue}>{stats.user.totalXP}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Текущая серия:</Text>
                <Text style={[styles.statValue, { color: '#FFD700' }]}>🔥 {stats.user.streak} дн.</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Лучшая серия:</Text>
                <Text style={[styles.statValue, { color: '#4CAF50' }]}>⭐ {stats.user.longestStreak} дн.</Text>
              </View>
            </View>
          </View>

          {/* Missions Stats */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Миссии</Text>
            <View style={styles.statCard}>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Всего миссий:</Text>
                <Text style={styles.statValue}>{stats.missions.total}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Завершено:</Text>
                <Text style={[styles.statValue, { color: '#4CAF50' }]}>{stats.missions.completed}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Активно:</Text>
                <Text style={[styles.statValue, { color: '#FFD700' }]}>{stats.missions.active}</Text>
              </View>
              <View style={styles.progressRow}>
                <Text style={styles.statLabel}>Прогресс:</Text>
                <View style={styles.progressBarContainer}>
                  <ProgressBar current={stats.missions.completed} max={stats.missions.total} height={12} showLabel={false} />
                </View>
              </View>
            </View>
          </View>

          {/* Completion Stats */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Выполнено</Text>
            <View style={styles.statGrid}>
              <View style={styles.statGridItem}>
                <Text style={styles.gridValue}>{stats.user.totalMissionsCompleted}</Text>
                <Text style={styles.gridLabel}>Миссий</Text>
              </View>
              <View style={styles.statGridItem}>
                <Text style={styles.gridValue}>{stats.user.totalTasksCompleted}</Text>
                <Text style={styles.gridLabel}>Задач</Text>
              </View>
              <View style={styles.statGridItem}>
                <Text style={styles.gridValue}>{stats.user.totalStepsCompleted}</Text>
                <Text style={styles.gridLabel}>Шагов</Text>
              </View>
            </View>
          </View>

          {/* Skills Stats */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Навыки</Text>
            <View style={styles.statCard}>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Всего навыков:</Text>
                <Text style={styles.statValue}>{stats.skills.total}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Средний уровень:</Text>
                <Text style={styles.statValue}>{stats.skills.averageLevel}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Сумма уровней:</Text>
                <Text style={styles.statValue}>{stats.skills.totalLevels}</Text>
              </View>
            </View>
          </View>

          {/* Rewards Stats */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Награды</Text>
            <View style={styles.statCard}>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Всего наград:</Text>
                <Text style={styles.statValue}>{stats.rewards.total}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Получено:</Text>
                <Text style={[styles.statValue, { color: '#4CAF50' }]}>{stats.rewards.purchased}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Доступно:</Text>
                <Text style={[styles.statValue, { color: '#FFD700' }]}>{stats.rewards.available}</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { padding: 16, paddingTop: 8 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  scrollView: { flex: 1 },
  content: { padding: 16, paddingTop: 0 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#fff', fontSize: 16 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 12 },
  statCard: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#333' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  statLabel: { color: '#aaa', fontSize: 16 },
  statValue: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  progressRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 12 },
  progressBarContainer: { flex: 1, marginLeft: 12 },
  statGrid: { flexDirection: 'row', gap: 12 },
  statGridItem: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  gridValue: { fontSize: 32, fontWeight: 'bold', color: '#FFD700', marginBottom: 8 },
  gridLabel: { color: '#aaa', fontSize: 14 },
});
## missions/[id].tsx

import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Alert 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Mission } from '../../utils/types';
import * as api from '../../utils/api';
import { ProgressBar } from '../../components/ProgressBar';
import { useApp } from '../../contexts/AppContext';

export default function MissionDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { refreshAll, skills } = useApp();
  const [mission, setMission] = useState<Mission | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMission();
  }, [id]);

  const loadMission = async () => {
    try {
      const response = await api.getMission(id as string);
      setMission(response.data);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить миссию');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteStep = async (taskIdx: number, stepIdx: number) => {
    if (!mission) return;

    const step = mission.tasks[taskIdx].steps[stepIdx];
    
    // If already completed, uncomplete it
    if (step.isCompleted) {
      try {
        const response = await api.uncompleteStep(mission.id!, taskIdx, stepIdx);
        setMission(response.data.mission);
        await refreshAll();
        Alert.alert('Отменено', `Шаг отменён. -${step.xpReward} XP`);
      } catch (error: any) {
        const message = error.response?.data?.detail || 'Ошибка при отмене';
        Alert.alert('Ошибка', message);
      }
      return;
    }

    // Complete step
    try {
      const response = await api.completeStep(mission.id!, taskIdx, stepIdx);
      setMission(response.data.mission);
      await refreshAll();
      
      // Show XP gain feedback
      Alert.alert('Успех!', `+${step.xpReward} XP`);
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Ошибка при выполнении';
      Alert.alert('Ошибка', message);
    }
  };

  const handleCompleteTask = async (taskIdx: number) => {
    if (!mission) return;

    const task = mission.tasks[taskIdx];
    
    // Only allow if task has no steps
    if (task.steps.length > 0) {
      Alert.alert('Ошибка', 'Сначала выполните все шаги задачи');
      return;
    }

    if (task.isCompleted) {
      Alert.alert('Ошибка', 'Задача уже выполнена');
      return;
    }

    try {
      const response = await api.completeTask(mission.id!, taskIdx);
      setMission(response.data.mission);
      await refreshAll();
      
      Alert.alert('Успех!', `Задача выполнена! +${task.xpReward} XP`);
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Ошибка при выполнении';
      Alert.alert('Ошибка', message);
    }
  };

  const handleDeleteMission = async () => {
    Alert.alert(
      'Удалить миссию?',
      'Это действие нельзя отменить',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteMission(mission!.id!);
              await refreshAll();
              router.back();
            } catch (error) {
              Alert.alert('Ошибка', 'Не удалось удалить миссию');
            }
          },
        },
      ]
    );
  };

  if (loading || !mission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Загрузка...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const totalTasks = mission.tasks.length;
  const completedTasks = mission.tasks.filter(t => t.isCompleted).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Назад</Text>
        </TouchableOpacity>
        <View style={styles.headerButtons}>
          <TouchableOpacity 
            onPress={() => router.push(`/missions/edit/${mission.id}`)}
            style={styles.editButton}
          >
            <Text style={styles.editText}>✎ Править</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDeleteMission}>
            <Text style={styles.deleteText}>Удалить</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          {/* Mission Header */}
          <View style={styles.missionHeader}>
            <Text style={styles.title}>{mission.title}</Text>
            {mission.description && (
              <Text style={styles.description}>{mission.description}</Text>
            )}
            
            <View style={styles.progressSection}>
              <Text style={styles.progressText}>
                Прогресс: {completedTasks} / {totalTasks}
              </Text>
              <ProgressBar 
                current={completedTasks}
                max={totalTasks}
                height={16}
              />
            </View>
          </View>

          {/* Rewards Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Награды</Text>
            <View style={styles.rewardsContainer}>
              <View style={styles.rewardItem}>
                <Text style={styles.rewardLabel}>Общий XP:</Text>
                <Text style={styles.rewardValue}>+{mission.totalXPReward}</Text>
              </View>
              {mission.skillRewards.map((reward, idx) => {
                const skill = skills.find(s => s.id === reward.skillId);
                return (
                  <View key={idx} style={styles.rewardItem}>
                    <Text style={styles.rewardLabel}>{skill?.name || 'Навык'}:</Text>
                    <Text style={styles.rewardValue}>+{reward.xpAmount} XP</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Tasks Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Задачи</Text>
            {mission.tasks.map((task, taskIdx) => (
              <View key={taskIdx} style={styles.taskCard}>
                <View style={styles.taskHeader}>
                  <Text style={[styles.taskTitle, task.isCompleted && styles.completedText]}>
                    {task.isCompleted ? '✓ ' : ''}{task.title}
                  </Text>
                  <Text style={styles.taskXP}>+{task.xpReward} XP</Text>
                </View>

                {/* Steps */}
                {task.steps.length > 0 ? (
                  <View style={styles.stepsContainer}>
                    {task.steps.map((step, stepIdx) => (
                      <TouchableOpacity
                        key={stepIdx}
                        style={styles.stepItem}
                        onPress={() => handleCompleteStep(taskIdx, stepIdx)}
                        disabled={mission.isCompleted}
                      >
                        <View style={[
                          styles.checkbox,
                          step.isCompleted && styles.checkboxChecked
                        ]}>
                          {step.isCompleted && <Text style={styles.checkmark}>✓</Text>}
                        </View>
                        <Text style={[
                          styles.stepText,
                          step.isCompleted && styles.completedText
                        ]}>
                          {step.title}
                        </Text>
                        <Text style={styles.stepXP}>+{step.xpReward}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  // Task without steps - show complete button
                  !task.isCompleted && (
                    <TouchableOpacity
                      style={styles.completeTaskButton}
                      onPress={() => handleCompleteTask(taskIdx)}
                      disabled={mission.isCompleted}
                    >
                      <Text style={styles.completeTaskButtonText}>Завершить задачу</Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
            ))}
          </View>

          {mission.isCompleted && (
            <View style={styles.completedBanner}>
              <Text style={styles.completedBannerText}>
                ✓ Миссия завершена!
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: '600',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  editButton: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  editText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteText: {
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  missionHeader: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  description: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 16,
  },
  progressSection: {
    marginTop: 8,
  },
  progressText: {
    color: '#ddd',
    fontSize: 14,
    marginBottom: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  rewardsContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
  },
  rewardItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  rewardLabel: {
    color: '#aaa',
    fontSize: 16,
  },
  rewardValue: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
  },
  taskCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  taskTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
  },
  taskXP: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: 'bold',
  },
  stepsContainer: {
    marginTop: 8,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    marginBottom: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#666',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  checkmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  stepText: {
    flex: 1,
    color: '#ddd',
    fontSize: 14,
  },
  stepXP: {
    color: '#FFD700',
    fontSize: 12,
  },
  completedText: {
    color: '#4CAF50',
    textDecorationLine: 'line-through',
  },
  completeTaskButton: {
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  completeTaskButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  completedBanner: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  completedBannerText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

## missions/create.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useApp } from '../../contexts/AppContext';
import * as api from '../../utils/api';
import { Task, Step, SkillReward } from '../../utils/types';

export default function CreateMissionScreen() {
  const router = useRouter();
  const { skills, refreshMissions } = useApp();
  const [loading, setLoading] = useState(false);

  // Mission fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'main' | 'side' | 'daily'>('main');
  const [totalXPReward, setTotalXPReward] = useState('50');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [skillRewards, setSkillRewards] = useState<SkillReward[]>([]);

  const addTask = () => {
    setTasks([...tasks, { title: '', xpReward: 10, steps: [], isCompleted: false }]);
  };

  const removeTask = (index: number) => {
    setTasks(tasks.filter((_, i) => i !== index));
  };

  const updateTask = (index: number, field: string, value: any) => {
    const updated = [...tasks];
    updated[index] = { ...updated[index], [field]: value };
    setTasks(updated);
  };

  const addStep = (taskIndex: number) => {
    const updated = [...tasks];
    updated[taskIndex].steps.push({ title: '', xpReward: 5, isCompleted: false });
    setTasks(updated);
  };

  const removeStep = (taskIndex: number, stepIndex: number) => {
    const updated = [...tasks];
    updated[taskIndex].steps = updated[taskIndex].steps.filter((_, i) => i !== stepIndex);
    setTasks(updated);
  };

  const updateStep = (taskIndex: number, stepIndex: number, field: string, value: any) => {
    const updated = [...tasks];
    updated[taskIndex].steps[stepIndex] = {
      ...updated[taskIndex].steps[stepIndex],
      [field]: value,
    };
    setTasks(updated);
  };

  const addSkillReward = () => {
    if (skills.length === 0) {
      Alert.alert('Ошибка', 'Сначала создайте навыки');
      return;
    }
    setSkillRewards([...skillRewards, { skillId: skills[0].id!, xpAmount: 10 }]);
  };

  const removeSkillReward = (index: number) => {
    setSkillRewards(skillRewards.filter((_, i) => i !== index));
  };

  const updateSkillReward = (index: number, field: string, value: any) => {
    const updated = [...skillRewards];
    updated[index] = { ...updated[index], [field]: value };
    setSkillRewards(updated);
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Ошибка', 'Введите название миссии');
      return;
    }

    if (tasks.length === 0) {
      Alert.alert('Ошибка', 'Добавьте хотя бы одну задачу');
      return;
    }

    // Validate all tasks have titles
    for (let i = 0; i < tasks.length; i++) {
      if (!tasks[i].title.trim()) {
        Alert.alert('Ошибка', `Задача ${i + 1} должна иметь название`);
        return;
      }
    }

    setLoading(true);
    try {
      await api.createMission({
        title: title.trim(),
        description: description.trim(),
        type,
        totalXPReward: parseInt(totalXPReward) || 0,
        skillRewards,
        tasks,
      });

      await refreshMissions();
      Alert.alert('Успех', 'Миссия создана!');
      router.back();
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось создать миссию');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancelText}>Отмена</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Новая миссия</Text>
        <TouchableOpacity onPress={handleCreate} disabled={loading}>
          <Text style={[styles.saveText, loading && styles.disabledText]}>
            {loading ? 'Создание...' : 'Создать'}
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView style={styles.scrollView}>
          <View style={styles.content}>
            {/* Basic Info */}
            <View style={styles.section}>
              <Text style={styles.label}>Название *</Text>
              <TextInput
                style={styles.input}
                placeholder="Название миссии"
                placeholderTextColor="#666"
                value={title}
                onChangeText={setTitle}
              />

              <Text style={styles.label}>Описание</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Описание миссии"
                placeholderTextColor="#666"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />

              {/* Type Selection */}
              <Text style={styles.label}>Тип миссии</Text>
              <View style={styles.typeContainer}>
                <TouchableOpacity
                  style={[styles.typeButton, type === 'main' && styles.typeButtonActive]}
                  onPress={() => setType('main')}
                >
                  <Text style={[styles.typeText, type === 'main' && styles.typeTextActive]}>
                    Основная
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeButton, type === 'side' && styles.typeButtonActive]}
                  onPress={() => setType('side')}
                >
                  <Text style={[styles.typeText, type === 'side' && styles.typeTextActive]}>
                    Дополнительная
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeButton, type === 'daily' && styles.typeButtonActive]}
                  onPress={() => setType('daily')}
                >
                  <Text style={[styles.typeText, type === 'daily' && styles.typeTextActive]}>
                    Ежедневная
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Награда XP</Text>
              <TextInput
                style={styles.input}
                placeholder="50"
                placeholderTextColor="#666"
                value={totalXPReward}
                onChangeText={setTotalXPReward}
                keyboardType="numeric"
              />
            </View>

            {/* Skill Rewards */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Награды навыкам</Text>
                <TouchableOpacity style={styles.addButton} onPress={addSkillReward}>
                  <Text style={styles.addButtonText}>+ Добавить</Text>
                </TouchableOpacity>
              </View>

              {skillRewards.map((reward, idx) => (
                <View key={idx} style={styles.rewardCard}>
                  <View style={styles.rewardRow}>
                    <View style={styles.skillPickerContainer}>
                      <Text style={styles.skillLabel}>Навык:</Text>
                      <View style={styles.skillPicker}>
                        {skills.map((skill) => (
                          <TouchableOpacity
                            key={skill.id}
                            style={[
                              styles.skillOption,
                              reward.skillId === skill.id && styles.skillOptionActive,
                            ]}
                            onPress={() => updateSkillReward(idx, 'skillId', skill.id)}
                          >
                            <Text
                              style={[
                                styles.skillOptionText,
                                reward.skillId === skill.id && styles.skillOptionTextActive,
                              ]}
                            >
                              {skill.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <View style={styles.xpInputContainer}>
                      <Text style={styles.skillLabel}>XP:</Text>
                      <TextInput
                        style={styles.smallInput}
                        value={String(reward.xpAmount)}
                        onChangeText={(v) => updateSkillReward(idx, 'xpAmount', parseInt(v) || 0)}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeSkillReward(idx)}
                  >
                    <Text style={styles.removeButtonText}>Удалить</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {/* Tasks */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Задачи *</Text>
                <TouchableOpacity style={styles.addButton} onPress={addTask}>
                  <Text style={styles.addButtonText}>+ Добавить задачу</Text>
                </TouchableOpacity>
              </View>

              {tasks.map((task, taskIdx) => (
                <View key={taskIdx} style={styles.taskCard}>
                  <Text style={styles.taskNumber}>Задача {taskIdx + 1}</Text>

                  <TextInput
                    style={styles.input}
                    placeholder="Название задачи"
                    placeholderTextColor="#666"
                    value={task.title}
                    onChangeText={(v) => updateTask(taskIdx, 'title', v)}
                  />

                  <View style={styles.row}>
                    <Text style={styles.label}>XP награда:</Text>
                    <TextInput
                      style={styles.smallInput}
                      value={String(task.xpReward)}
                      onChangeText={(v) => updateTask(taskIdx, 'xpReward', parseInt(v) || 0)}
                      keyboardType="numeric"
                    />
                  </View>

                  {/* Steps */}
                  <View style={styles.stepsSection}>
                    <View style={styles.stepsHeader}>
                      <Text style={styles.stepsTitle}>Шаги</Text>
                      <TouchableOpacity
                        style={styles.addStepButton}
                        onPress={() => addStep(taskIdx)}
                      >
                        <Text style={styles.addStepText}>+ Шаг</Text>
                      </TouchableOpacity>
                    </View>

                    {task.steps.map((step, stepIdx) => (
                      <View key={stepIdx} style={styles.stepRow}>
                        <TextInput
                          style={[styles.input, styles.stepInput]}
                          placeholder={`Шаг ${stepIdx + 1}`}
                          placeholderTextColor="#666"
                          value={step.title}
                          onChangeText={(v) => updateStep(taskIdx, stepIdx, 'title', v)}
                        />
                        <TextInput
                          style={styles.tinyInput}
                          value={String(step.xpReward)}
                          onChangeText={(v) =>
                            updateStep(taskIdx, stepIdx, 'xpReward', parseInt(v) || 0)
                          }
                          keyboardType="numeric"
                        />
                        <TouchableOpacity onPress={() => removeStep(taskIdx, stepIdx)}>
                          <Text style={styles.removeIcon}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={styles.removeTaskButton}
                    onPress={() => removeTask(taskIdx)}
                  >
                    <Text style={styles.removeButtonText}>Удалить задачу</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  cancelText: {
    color: '#FF6B6B',
    fontSize: 16,
  },
  saveText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledText: {
    opacity: 0.5,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  label: {
    color: '#ddd',
    fontSize: 14,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  typeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  typeButton: {
    flex: 1,
    padding: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  typeText: {
    color: '#aaa',
    fontSize: 14,
  },
  typeTextActive: {
    color: '#000',
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  addButtonText: {
    color: '#000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  rewardCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  skillPickerContainer: {
    flex: 1,
  },
  skillLabel: {
    color: '#aaa',
    fontSize: 12,
    marginBottom: 4,
  },
  skillPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  skillOption: {
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 4,
  },
  skillOptionActive: {
    backgroundColor: '#8B5CF6',
  },
  skillOptionText: {
    color: '#aaa',
    fontSize: 11,
  },
  skillOptionTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  xpInputContainer: {
    width: 80,
  },
  smallInput: {
    backgroundColor: '#2a2a2a',
    color: '#fff',
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  removeButton: {
    alignSelf: 'flex-start',
  },
  removeButtonText: {
    color: '#FF6B6B',
    fontSize: 12,
  },
  taskCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  taskNumber: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  stepsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  stepsTitle: {
    color: '#ddd',
    fontSize: 14,
    fontWeight: '600',
  },
  addStepButton: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  addStepText: {
    color: '#000',
    fontSize: 11,
    fontWeight: 'bold',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  stepInput: {
    flex: 1,
    marginBottom: 0,
  },
  tinyInput: {
    backgroundColor: '#2a2a2a',
    color: '#fff',
    borderRadius: 6,
    padding: 8,
    fontSize: 12,
    width: 50,
    textAlign: 'center',
  },
  removeIcon: {
    color: '#FF6B6B',
    fontSize: 18,
    padding: 4,
  },
  removeTaskButton: {
    marginTop: 12,
    padding: 8,
    alignSelf: 'flex-start',
  },
});

## missions/edit/[id].tsx

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../../contexts/AppContext';
import * as api from '../../../utils/api';
import { Task, Step, SkillReward } from '../../../utils/types';

export default function EditMissionScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { skills, refreshMissions } = useApp();
  const [loading, setLoading] = useState(true);

  // Mission fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'main' | 'side' | 'daily'>('main');
  const [totalXPReward, setTotalXPReward] = useState('50');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [skillRewards, setSkillRewards] = useState<SkillReward[]>([]);

  useEffect(() => {
    loadMission();
  }, [id]);

  const loadMission = async () => {
    try {
      const response = await api.getMission(id as string);
      const mission = response.data;
      
      setTitle(mission.title);
      setDescription(mission.description);
      setType(mission.type);
      setTotalXPReward(String(mission.totalXPReward));
      setTasks(mission.tasks);
      setSkillRewards(mission.skillRewards);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить миссию');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const addTask = () => {
    setTasks([...tasks, { title: '', xpReward: 10, steps: [], isCompleted: false }]);
  };

  const removeTask = (index: number) => {
    setTasks(tasks.filter((_, i) => i !== index));
  };

  const updateTask = (index: number, field: string, value: any) => {
    const updated = [...tasks];
    updated[index] = { ...updated[index], [field]: value };
    setTasks(updated);
  };

  const addStep = (taskIndex: number) => {
    const updated = [...tasks];
    updated[taskIndex].steps.push({ title: '', xpReward: 5, isCompleted: false });
    setTasks(updated);
  };

  const removeStep = (taskIndex: number, stepIndex: number) => {
    const updated = [...tasks];
    updated[taskIndex].steps = updated[taskIndex].steps.filter((_, i) => i !== stepIndex);
    setTasks(updated);
  };

  const updateStep = (taskIndex: number, stepIndex: number, field: string, value: any) => {
    const updated = [...tasks];
    updated[taskIndex].steps[stepIndex] = {
      ...updated[taskIndex].steps[stepIndex],
      [field]: value,
    };
    setTasks(updated);
  };

  const addSkillReward = () => {
    if (skills.length === 0) {
      Alert.alert('Ошибка', 'Сначала создайте навыки');
      return;
    }
    setSkillRewards([...skillRewards, { skillId: skills[0].id!, xpAmount: 10 }]);
  };

  const removeSkillReward = (index: number) => {
    setSkillRewards(skillRewards.filter((_, i) => i !== index));
  };

  const updateSkillReward = (index: number, field: string, value: any) => {
    const updated = [...skillRewards];
    updated[index] = { ...updated[index], [field]: value };
    setSkillRewards(updated);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Ошибка', 'Введите название миссии');
      return;
    }

    if (tasks.length === 0) {
      Alert.alert('Ошибка', 'Добавьте хотя бы одну задачу');
      return;
    }

    // Validate all tasks have titles
    for (let i = 0; i < tasks.length; i++) {
      if (!tasks[i].title.trim()) {
        Alert.alert('Ошибка', `Задача ${i + 1} должна иметь название`);
        return;
      }
    }

    setLoading(true);
    try {
      await api.updateMission(id as string, {
        title: title.trim(),
        description: description.trim(),
        type,
        totalXPReward: parseInt(totalXPReward) || 0,
        skillRewards,
        tasks,
      });

      await refreshMissions();
      Alert.alert('Успех', 'Миссия обновлена!');
      router.back();
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось обновить миссию');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Загрузка...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancelText}>Отмена</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Редактировать</Text>
        <TouchableOpacity onPress={handleSave} disabled={loading}>
          <Text style={[styles.saveText, loading && styles.disabledText]}>
            {loading ? 'Сохранение...' : 'Сохранить'}
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView style={styles.scrollView}>
          <View style={styles.content}>
            {/* Basic Info */}
            <View style={styles.section}>
              <Text style={styles.label}>Название *</Text>
              <TextInput
                style={styles.input}
                placeholder="Название миссии"
                placeholderTextColor="#666"
                value={title}
                onChangeText={setTitle}
              />

              <Text style={styles.label}>Описание</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Описание миссии"
                placeholderTextColor="#666"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />

              {/* Type Selection */}
              <Text style={styles.label}>Тип миссии</Text>
              <View style={styles.typeContainer}>
                <TouchableOpacity
                  style={[styles.typeButton, type === 'main' && styles.typeButtonActive]}
                  onPress={() => setType('main')}
                >
                  <Text style={[styles.typeText, type === 'main' && styles.typeTextActive]}>
                    Основная
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeButton, type === 'side' && styles.typeButtonActive]}
                  onPress={() => setType('side')}
                >
                  <Text style={[styles.typeText, type === 'side' && styles.typeTextActive]}>
                    Дополнительная
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeButton, type === 'daily' && styles.typeButtonActive]}
                  onPress={() => setType('daily')}
                >
                  <Text style={[styles.typeText, type === 'daily' && styles.typeTextActive]}>
                    Ежедневная
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Награда XP</Text>
              <TextInput
                style={styles.input}
                placeholder="50"
                placeholderTextColor="#666"
                value={totalXPReward}
                onChangeText={setTotalXPReward}
                keyboardType="numeric"
              />
            </View>

            {/* Skill Rewards */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Награды навыкам</Text>
                <TouchableOpacity style={styles.addButton} onPress={addSkillReward}>
                  <Text style={styles.addButtonText}>+ Добавить</Text>
                </TouchableOpacity>
              </View>

              {skillRewards.map((reward, idx) => (
                <View key={idx} style={styles.rewardCard}>
                  <View style={styles.rewardRow}>
                    <View style={styles.skillPickerContainer}>
                      <Text style={styles.skillLabel}>Навык:</Text>
                      <View style={styles.skillPicker}>
                        {skills.map((skill) => (
                          <TouchableOpacity
                            key={skill.id}
                            style={[
                              styles.skillOption,
                              reward.skillId === skill.id && styles.skillOptionActive,
                            ]}
                            onPress={() => updateSkillReward(idx, 'skillId', skill.id)}
                          >
                            <Text
                              style={[
                                styles.skillOptionText,
                                reward.skillId === skill.id && styles.skillOptionTextActive,
                              ]}
                            >
                              {skill.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <View style={styles.xpInputContainer}>
                      <Text style={styles.skillLabel}>XP:</Text>
                      <TextInput
                        style={styles.smallInput}
                        value={String(reward.xpAmount)}
                        onChangeText={(v) => updateSkillReward(idx, 'xpAmount', parseInt(v) || 0)}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeSkillReward(idx)}
                  >
                    <Text style={styles.removeButtonText}>Удалить</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {/* Tasks */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Задачи *</Text>
                <TouchableOpacity style={styles.addButton} onPress={addTask}>
                  <Text style={styles.addButtonText}>+ Добавить задачу</Text>
                </TouchableOpacity>
              </View>

              {tasks.map((task, taskIdx) => (
                <View key={taskIdx} style={styles.taskCard}>
                  <Text style={styles.taskNumber}>Задача {taskIdx + 1}</Text>

                  <TextInput
                    style={styles.input}
                    placeholder="Название задачи"
                    placeholderTextColor="#666"
                    value={task.title}
                    onChangeText={(v) => updateTask(taskIdx, 'title', v)}
                  />

                  <View style={styles.row}>
                    <Text style={styles.label}>XP награда:</Text>
                    <TextInput
                      style={styles.smallInput}
                      value={String(task.xpReward)}
                      onChangeText={(v) => updateTask(taskIdx, 'xpReward', parseInt(v) || 0)}
                      keyboardType="numeric"
                    />
                  </View>

                  {/* Steps */}
                  <View style={styles.stepsSection}>
                    <View style={styles.stepsHeader}>
                      <Text style={styles.stepsTitle}>Шаги</Text>
                      <TouchableOpacity
                        style={styles.addStepButton}
                        onPress={() => addStep(taskIdx)}
                      >
                        <Text style={styles.addStepText}>+ Шаг</Text>
                      </TouchableOpacity>
                    </View>

                    {task.steps.map((step, stepIdx) => (
                      <View key={stepIdx} style={styles.stepRow}>
                        <TextInput
                          style={[styles.input, styles.stepInput]}
                          placeholder={`Шаг ${stepIdx + 1}`}
                          placeholderTextColor="#666"
                          value={step.title}
                          onChangeText={(v) => updateStep(taskIdx, stepIdx, 'title', v)}
                        />
                        <TextInput
                          style={styles.tinyInput}
                          value={String(step.xpReward)}
                          onChangeText={(v) =>
                            updateStep(taskIdx, stepIdx, 'xpReward', parseInt(v) || 0)
                          }
                          keyboardType="numeric"
                        />
                        <TouchableOpacity onPress={() => removeStep(taskIdx, stepIdx)}>
                          <Text style={styles.removeIcon}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={styles.removeTaskButton}
                    onPress={() => removeTask(taskIdx)}
                  >
                    <Text style={styles.removeButtonText}>Удалить задачу</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  cancelText: {
    color: '#FF6B6B',
    fontSize: 16,
  },
  saveText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledText: {
    opacity: 0.5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  label: {
    color: '#ddd',
    fontSize: 14,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  typeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  typeButton: {
    flex: 1,
    padding: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  typeText: {
    color: '#aaa',
    fontSize: 14,
  },
  typeTextActive: {
    color: '#000',
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  addButtonText: {
    color: '#000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  rewardCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  skillPickerContainer: {
    flex: 1,
  },
  skillLabel: {
    color: '#aaa',
    fontSize: 12,
    marginBottom: 4,
  },
  skillPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  skillOption: {
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 4,
  },
  skillOptionActive: {
    backgroundColor: '#8B5CF6',
  },
  skillOptionText: {
    color: '#aaa',
    fontSize: 11,
  },
  skillOptionTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  xpInputContainer: {
    width: 80,
  },
  smallInput: {
    backgroundColor: '#2a2a2a',
    color: '#fff',
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  removeButton: {
    alignSelf: 'flex-start',
  },
  removeButtonText: {
    color: '#FF6B6B',
    fontSize: 12,
  },
  taskCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  taskNumber: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  stepsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  stepsTitle: {
    color: '#ddd',
    fontSize: 14,
    fontWeight: '600',
  },
  addStepButton: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  addStepText: {
    color: '#000',
    fontSize: 11,
    fontWeight: 'bold',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  stepInput: {
    flex: 1,
    marginBottom: 0,
  },
  tinyInput: {
    backgroundColor: '#2a2a2a',
    color: '#fff',
    borderRadius: 6,
    padding: 8,
    fontSize: 12,
    width: 50,
    textAlign: 'center',
  },
  removeIcon: {
    color: '#FF6B6B',
    fontSize: 18,
    padding: 4,
  },
  removeTaskButton: {
    marginTop: 12,
    padding: 8,
    alignSelf: 'flex-start',
  },
});

---

# Configuration

## package.json

{
  "name": "frontend",
  "main": "expo-router/entry",
  "version": "1.0.0",
  "scripts": {
    "start": "expo start",
    "reset-project": "node ./scripts/reset-project.js",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "lint": "expo lint"
  },
  "dependencies": {
    "@babel/runtime": "^7.20.6",
    "@expo/metro-runtime": "^6.1.2",
    "@expo/ngrok": "^4.1.3",
    "@expo/vector-icons": "^15.0.3",
    "@react-native-async-storage/async-storage": "2.2.0",
    "@react-navigation/bottom-tabs": "^7.4.0",
    "@react-navigation/elements": "^2.3.8",
    "@react-navigation/native": "^7.1.8",
    "@react-navigation/native-stack": "^7.3.10",
    "axios": "^1.13.6",
    "date-fns": "^4.1.0",
    "expo": "54.0.33",
    "expo-blur": "~15.0.8",
    "expo-constants": "~18.0.13",
    "expo-font": "~14.0.11",
    "expo-haptics": "~15.0.8",
    "expo-image": "~3.0.11",
    "expo-linking": "~8.0.11",
    "expo-router": "~6.0.22",
    "expo-splash-screen": "~31.0.13",
    "expo-status-bar": "~3.0.9",
    "expo-symbols": "~1.0.8",
    "expo-system-ui": "~6.0.9",
    "expo-web-browser": "~15.0.10",
    "react": "19.1.0",
    "react-dom": "19.1.0",
    "react-native": "0.81.5",
    "react-native-dotenv": "^3.4.11",
    "react-native-gesture-handler": "~2.28.0",
    "react-native-reanimated": "~4.1.1",
    "react-native-safe-area-context": "~5.6.0",
    "react-native-screens": "~4.16.0",
    "react-native-web": "^0.21.0",
    "react-native-webview": "13.15.0",
    "react-native-worklets": "0.5.1"
  },
  "devDependencies": {
    "@babel/core": "^7.25.2",
    "@types/react": "~19.1.0",
    "eslint": "^9.25.0",
    "eslint-config-expo": "~10.0.0",
    "typescript": "~5.9.3"
  },
  "private": true,
  "packageManager": "yarn@1.22.22+sha512.a6b2f7906b721bba3d67d4aff083df04dad64c399707841b7acf00f6b133b7ac24255f2652fa22ae3534329dc6180534e98d17432037ff6fd140556e2bb3137e"
}

## app.json

{
  "expo": {
    "name": "frontend",
    "slug": "frontend",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "frontend",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "ios": {
      "supportsTablet": true
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#000"
      },
      "edgeToEdgeEnabled": true
    },
    "web": {
      "bundler": "metro",
      "output": "static",
      "favicon": "./assets/images/favicon.png"
    },
    "plugins": [
      "expo-router",
      [
        "expo-splash-screen",
        {
          "image": "./assets/images/splash-icon.png",
          "imageWidth": 200,
          "resizeMode": "contain",
          "backgroundColor": "#000"
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true
    }
  }
}

## requirements.txt

fastapi==0.110.1
uvicorn==0.25.0
boto3>=1.34.129
requests-oauthlib>=2.0.0
cryptography>=42.0.8
python-dotenv>=1.0.1
pymongo==4.5.0
pydantic>=2.6.4
email-validator>=2.2.0
pyjwt>=2.10.1
bcrypt==4.1.3
passlib>=1.7.4
tzdata>=2024.2
motor==3.3.1
pytest>=8.0.0
black>=24.1.1
isort>=5.13.2
flake8>=7.0.0
mypy>=1.8.0
python-jose>=3.3.0
requests>=2.31.0
pandas>=2.2.0
numpy>=1.26.0
python-multipart>=0.0.9
jq>=1.6.0
typer>=0.9.0
emergentintegrations==0.1.0
---

# Статистика проекта

## Backend:
- Python файлы: 1
- Строк кода: 983

## Frontend:
- TypeScript файлы: 21
- Всего строк: 3581

## Всего:
- Общее количество файлов: 26
