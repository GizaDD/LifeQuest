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
