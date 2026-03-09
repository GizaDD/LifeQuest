import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProgressBar } from '../../components/ProgressBar';
import { useApp } from '../../contexts/AppContext';

const REWARDS_STORAGE_KEY = 'rewards';

export default function StatisticsScreen() {
  const { user, skills, missions, refreshAll } = useApp();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStatistics();
  }, [user, skills, missions]);

  const loadStatistics = async () => {
    try {
      setLoading(true);

      const storedRewards = await AsyncStorage.getItem(REWARDS_STORAGE_KEY);
      const rewards = storedRewards ? JSON.parse(storedRewards) : [];

      const totalMissions = missions.length;
      const completedMissions = missions.filter((m: any) => m.isCompleted || m.status === 'completed').length;
      const activeMissions = totalMissions - completedMissions;

      const totalSkills = skills.length;
      const totalLevels = skills.reduce((sum: number, skill: any) => sum + (skill.level || 0), 0);
      const averageLevel = totalSkills > 0 ? (totalLevels / totalSkills).toFixed(1) : 0;

      const purchasedRewards = rewards.filter((r: any) => r.isPurchased).length;
      const availableRewards = rewards.filter((r: any) => !r.isPurchased).length;

      const computedStats = {
        user: {
          level: user?.level || 0,
          totalXP: user?.totalXP || 0,
          streak: user?.streak || 0,
          longestStreak: user?.longestStreak || 0,
          totalMissionsCompleted: user?.totalMissionsCompleted || completedMissions,
          totalTasksCompleted: user?.totalTasksCompleted || 0,
          totalStepsCompleted: user?.totalStepsCompleted || 0,
        },
        missions: {
          total: totalMissions,
          completed: completedMissions,
          active: activeMissions,
        },
        skills: {
          total: totalSkills,
          averageLevel: averageLevel,
          totalLevels: totalLevels,
        },
        rewards: {
          total: rewards.length,
          purchased: purchasedRewards,
          available: availableRewards,
        },
      };

      setStats(computedStats);
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

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={async () => {
              await refreshAll();
              await loadStatistics();
            }}
          />
        }
      >
        <View style={styles.content}>
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
                  <ProgressBar
                    current={stats.missions.completed}
                    max={stats.missions.total || 1}
                    height={12}
                    showLabel={false}
                  />
                </View>
              </View>
            </View>
          </View>

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
