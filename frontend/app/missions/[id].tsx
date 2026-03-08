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
        <TouchableOpacity onPress={handleDeleteMission}>
          <Text style={styles.deleteText}>Удалить</Text>
        </TouchableOpacity>
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
