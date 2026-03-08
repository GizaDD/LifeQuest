export interface User {
  id?: string;
  level: number;
  currentXP: number;
  xpToNextLevel: number;
  totalXP: number;
  lastDailyReset?: string;
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
}

export interface Task {
  title: string;
  xpReward: number;
  steps: Step[];
  isCompleted: boolean;
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
