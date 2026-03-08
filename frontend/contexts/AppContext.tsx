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
