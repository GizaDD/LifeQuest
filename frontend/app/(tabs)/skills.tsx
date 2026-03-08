import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, TextInput, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../contexts/AppContext';
import { SkillCard } from '../../components/SkillCard';
import * as api from '../../utils/api';

export default function SkillsScreen() {
  const { skills, loading, refreshSkills } = useApp();
  const [modalVisible, setModalVisible] = useState(false);
  const [skillName, setSkillName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreateSkill = async () => {
    if (!skillName.trim()) {
      Alert.alert('Ошибка', 'Введите название навыка');
      return;
    }

    setCreating(true);
    try {
      await api.createSkill(skillName.trim());
      await refreshSkills();
      setSkillName('');
      setModalVisible(false);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось создать навык');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSkill = async (skillId: string, isDefault: boolean) => {
    if (isDefault) {
      Alert.alert('Ошибка', 'Нельзя удалить стандартный навык');
      return;
    }

    Alert.alert(
      'Удалить навык?',
      'Это действие нельзя отменить',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteSkill(skillId);
              await refreshSkills();
            } catch (error) {
              Alert.alert('Ошибка', 'Не удалось удалить навык');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Навыки</Text>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.addButtonText}>+ Добавить</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refreshSkills} />
        }
      >
        {skills.map(skill => (
          <TouchableOpacity
            key={skill.id}
            onLongPress={() => handleDeleteSkill(skill.id!, skill.isDefault)}
            activeOpacity={0.9}
          >
            <SkillCard skill={skill} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Create Skill Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Новый навык</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Название навыка"
              placeholderTextColor="#666"
              value={skillName}
              onChangeText={setSkillName}
              autoFocus
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setSkillName('');
                  setModalVisible(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Отмена</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalButton, styles.createButton]}
                onPress={handleCreateSkill}
                disabled={creating}
              >
                <Text style={styles.createButtonText}>
                  {creating ? 'Создание...' : 'Создать'}
                </Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  addButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: 0,
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
  createButton: {
    backgroundColor: '#8B5CF6',
  },
  cancelButtonText: {
    color: '#aaa',
    fontSize: 16,
    fontWeight: 'bold',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
