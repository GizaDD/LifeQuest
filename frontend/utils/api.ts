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
export const resetDailyMissions = () => api.post('/user/reset-daily');

// Skills APIs
export const getSkills = () => api.get('/skills');
export const createSkill = (name: string) => api.post('/skills', { name });
export const deleteSkill = (skillId: string) => api.delete(`/skills/${skillId}`);

// Missions APIs
export const getMissions = () => api.get('/missions');
export const getMission = (missionId: string) => api.get(`/missions/${missionId}`);
export const createMission = (missionData: any) => api.post('/missions', missionData);
export const deleteMission = (missionId: string) => api.delete(`/missions/${missionId}`);

// Completion APIs
export const completeStep = (missionId: string, taskIdx: number, stepIdx: number) => 
  api.post(`/complete/step/${missionId}/${taskIdx}/${stepIdx}`);

export default api;
