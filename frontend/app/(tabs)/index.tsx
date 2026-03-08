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
