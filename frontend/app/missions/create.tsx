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
