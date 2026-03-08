import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Mission } from '../utils/types';
import { ProgressBar } from './ProgressBar';

interface MissionCardProps {
  mission: Mission;
  onPress: () => void;
}

export const MissionCard = ({ mission, onPress }: MissionCardProps) => {
  const totalTasks = mission.tasks.length;
  const completedTasks = mission.tasks.filter(t => t.isCompleted).length;
  
  const getMissionTypeColor = () => {
    switch (mission.type) {
      case 'main': return '#FF6B6B';
      case 'daily': return '#4ECDC4';
      case 'side': return '#95E1D3';
      default: return '#FFD700';
    }
  };

  const getMissionTypeLabel = () => {
    switch (mission.type) {
      case 'main': return 'Основная';
      case 'daily': return 'Ежедневная';
      case 'side': return 'Дополнительная';
      default: return mission.type;
    }
  };

  return (
    <TouchableOpacity 
      style={[styles.card, mission.isCompleted && styles.completedCard]} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>{mission.title}</Text>
        <View style={[styles.typeBadge, { backgroundColor: getMissionTypeColor() }]}>
          <Text style={styles.typeText}>{getMissionTypeLabel()}</Text>
        </View>
      </View>
      
      {mission.description && (
        <Text style={styles.description} numberOfLines={2}>{mission.description}</Text>
      )}
      
      <View style={styles.progressSection}>
        <Text style={styles.progressText}>
          Задачи: {completedTasks} / {totalTasks}
        </Text>
        <ProgressBar 
          current={completedTasks} 
          max={totalTasks} 
          height={8}
          showLabel={false}
        />
      </View>
      
      <View style={styles.footer}>
        <Text style={styles.xpText}>+{mission.totalXPReward} XP</Text>
        {mission.isCompleted && (
          <Text style={styles.completedText}>✓ Завершена</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  completedCard: {
    opacity: 0.6,
    borderColor: '#4CAF50',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    marginRight: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  description: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 12,
  },
  progressSection: {
    marginBottom: 12,
  },
  progressText: {
    color: '#ddd',
    fontSize: 12,
    marginBottom: 6,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  xpText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
  },
  completedText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
