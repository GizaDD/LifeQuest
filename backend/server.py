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
