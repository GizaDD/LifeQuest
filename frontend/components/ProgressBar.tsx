import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface ProgressBarProps {
  current: number;
  max: number;
  color?: string;
  height?: number;
  showLabel?: boolean;
}

export const ProgressBar = ({ 
  current, 
  max, 
  color = '#FFD700', 
  height = 20,
  showLabel = true 
}: ProgressBarProps) => {
  const percentage = Math.min((current / max) * 100, 100);

  return (
    <View style={styles.container}>
      <View style={[styles.barContainer, { height }]}>
        <View 
          style={[
            styles.barFill, 
            { width: `${percentage}%`, backgroundColor: color }
          ]} 
        />
        {showLabel && (
          <Text style={styles.label}>
            {current} / {max}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  barContainer: {
    width: '100%',
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  barFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 10,
  },
  label: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    zIndex: 1,
  },
});
