import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Skill } from '../utils/types';
import { ProgressBar } from './ProgressBar';

interface SkillCardProps {
  skill: Skill;
}

export const SkillCard = ({ skill }: SkillCardProps) => {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.name}>{skill.name}</Text>
        <View style={styles.levelBadge}>
          <Text style={styles.levelText}>Ур. {skill.level}</Text>
        </View>
      </View>
      
      <View style={styles.progressSection}>
        <ProgressBar 
          current={skill.currentXP} 
          max={skill.xpToNextLevel}
          color="#8B5CF6"
          height={16}
        />
      </View>
    </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  levelBadge: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  levelText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  progressSection: {
    marginTop: 4,
  },
});
