import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as api from '../../utils/api';
import { Reward } from '../../utils/types';
import { useApp } from '../../contexts/AppContext';

export default function RewardsScreen() {
  const { user, refreshUser } = useApp();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [xpCost, setXpCost] = useState('100');

  useEffect(() => {
    loadRewards();
  }, []);

  const loadRewards = async () => {
    try {
      const response = await api.getRewards();
      setRewards(response.data);
    } catch (error) {
      console.error('Error loading rewards:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Ошибка', 'Введите название награды');
      return;
    }

    try {
      await api.createReward({
        title: title.trim(),
        description: description.trim(),
        xpCost: parseInt(xpCost) || 100,
      });
      await loadRewards();
      setTitle('');
      setDescription('');
      setXpCost('100');
      setModalVisible(false);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось создать награду');
    }
  };

  const handlePurchase = async (reward: Reward) => {
    const totalXP = (user?.currentXP || 0) + (user?.totalXP || 0);
    if (totalXP < reward.xpCost) {
      Alert.alert('Недостаточно XP', `Нужно ${reward.xpCost} XP, у вас ${totalXP}`);
      return;
    }

    Alert.alert(
      'Купить награду?',
      `Потратить ${reward.xpCost} XP на "${reward.title}"?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Купить',
          onPress: async () => {
            try {
              await api.purchaseReward(reward.id!);
              await loadRewards();
              await refreshUser();
              Alert.alert('Поздравляем!', `Вы получили награду: ${reward.title}`);
            } catch (error) {
              Alert.alert('Ошибка', 'Не удалось купить награду');
            }
          },
        },
      ]
    );
  };

  const availableRewards = rewards.filter(r => !r.isPurchased);
  const purchasedRewards = rewards.filter(r => r.isPurchased);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Награды</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Text style={styles.addButtonText}>+ Создать</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.xpDisplay}>
        <Text style={styles.xpText}>Доступно XP: {(user?.currentXP || 0) + (user?.totalXP || 0)}</Text>
      </View>

      <ScrollView style={styles.scrollView} refreshControl={<RefreshControl refreshing={loading} onRefresh={loadRewards} />}>
        {availableRewards.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Доступные</Text>
            {availableRewards.map(reward => (
              <TouchableOpacity key={reward.id} style={styles.rewardCard} onPress={() => handlePurchase(reward)}>
                <View style={styles.rewardHeader}>
                  <Text style={styles.rewardTitle}>{reward.title}</Text>
                  <Text style={styles.rewardCost}>{reward.xpCost} XP</Text>
                </View>
                {reward.description && <Text style={styles.rewardDescription}>{reward.description}</Text>}
                <View style={styles.buyButton}>
                  <Text style={styles.buyButtonText}>Купить</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {purchasedRewards.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Получено</Text>
            {purchasedRewards.map(reward => (
              <View key={reward.id} style={[styles.rewardCard, styles.purchasedCard]}>
                <View style={styles.rewardHeader}>
                  <Text style={styles.rewardTitle}>{reward.title} ✓</Text>
                </View>
                {reward.description && <Text style={styles.rewardDescription}>{reward.description}</Text>}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Новая награда</Text>
            <TextInput style={styles.input} placeholder="Название" placeholderTextColor="#666" value={title} onChangeText={setTitle} />
            <TextInput style={[styles.input, styles.textArea]} placeholder="Описание" placeholderTextColor="#666" value={description} onChangeText={setDescription} multiline />
            <TextInput style={styles.input} placeholder="Стоимость в XP" placeholderTextColor="#666" value={xpCost} onChangeText={setXpCost} keyboardType="numeric" />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.createButton]} onPress={handleCreate}>
                <Text style={styles.createButtonText}>Создать</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 8 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  addButton: { backgroundColor: '#FFD700', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  addButtonText: { color: '#000', fontSize: 14, fontWeight: 'bold' },
  xpDisplay: { backgroundColor: '#1a1a1a', padding: 16, marginHorizontal: 16, marginBottom: 16, borderRadius: 12 },
  xpText: { color: '#FFD700', fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  scrollView: { flex: 1 },
  section: { padding: 16 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 12 },
  rewardCard: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#333' },
  purchasedCard: { opacity: 0.6, borderColor: '#4CAF50' },
  rewardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  rewardTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', flex: 1 },
  rewardCost: { color: '#FFD700', fontSize: 16, fontWeight: 'bold' },
  rewardDescription: { color: '#aaa', fontSize: 14, marginBottom: 12 },
  buyButton: { backgroundColor: '#4CAF50', padding: 10, borderRadius: 8, alignItems: 'center' },
  buyButtonText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1a1a1a', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 20 },
  input: { backgroundColor: '#2a2a2a', color: '#fff', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 12, borderWidth: 1, borderColor: '#333' },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  cancelButton: { backgroundColor: '#2a2a2a' },
  createButton: { backgroundColor: '#FFD700' },
  cancelButtonText: { color: '#aaa', fontSize: 16, fontWeight: 'bold' },
  createButtonText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
});