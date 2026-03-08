import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../contexts/AppContext';
import { ProgressBar } from '../../components/ProgressBar';
import { MissionCard } from '../../components/MissionCard';
import { SkillCard } from '../../components/SkillCard';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const { user, missions, skills, loading, refreshAll } = useApp();
  const router = useRouter();

  const activeMissions = missions.filter(m => !m.isCompleted).slice(0, 3);
  const topSkills = skills.slice(0, 3);

  // Get today's tasks from daily missions
  const todayTasks = missions
    .filter(m => m.type === 'daily' && !m.isCompleted)
    .flatMap(m => m.tasks.filter(t => !t.isCompleted))
    .slice(0, 5);

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
            <View style={styles.userHeader}>
              <Text style={styles.userName}>Игрок</Text>
              <View style={styles.levelBadge}>
                <Text style={styles.levelText}>Уровень {user?.level || 1}</Text>
              </View>
            </View>
            <View style={styles.xpSection}>
              <Text style={styles.xpLabel}>Опыт</Text>
              <ProgressBar 
                current={user?.currentXP || 0}
                max={user?.xpToNextLevel || 100}
                color="#FFD700"
                height={24}
              />
            </View>
            <Text style={styles.totalXP}>
              Всего XP: {user?.totalXP || 0}
            </Text>
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
  },
  levelText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  xpSection: {
    marginBottom: 8,
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
});
