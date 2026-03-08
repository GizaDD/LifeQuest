import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../contexts/AppContext';
import { MissionCard } from '../../components/MissionCard';
import { useRouter } from 'expo-router';

export default function MissionsScreen() {
  const { missions, loading, refreshMissions } = useApp();
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'main' | 'side' | 'daily'>('all');

  const filteredMissions = filter === 'all' 
    ? missions 
    : missions.filter(m => m.type === filter);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Миссии</Text>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => router.push('/missions/create')}
        >
          <Text style={styles.addButtonText}>+ Создать</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <TouchableOpacity 
          style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            Все
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.filterButton, filter === 'main' && styles.filterButtonActive]}
          onPress={() => setFilter('main')}
        >
          <Text style={[styles.filterText, filter === 'main' && styles.filterTextActive]}>
            Основные
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.filterButton, filter === 'side' && styles.filterButtonActive]}
          onPress={() => setFilter('side')}
        >
          <Text style={[styles.filterText, filter === 'side' && styles.filterTextActive]}>
            Доп.
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.filterButton, filter === 'daily' && styles.filterButtonActive]}
          onPress={() => setFilter('daily')}
        >
          <Text style={[styles.filterText, filter === 'daily' && styles.filterTextActive]}>
            Ежедневные
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refreshMissions} />
        }
      >
        {filteredMissions.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Нет миссий</Text>
            <Text style={styles.emptySubtext}>
              Создайте свою первую миссию!
            </Text>
          </View>
        ) : (
          filteredMissions.map(mission => (
            <MissionCard 
              key={mission.id} 
              mission={mission}
              onPress={() => router.push(`/missions/${mission.id}`)}
            />
          ))
        )}
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
    paddingTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  addButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  filterButtonActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  filterText: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#000',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: 0,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#aaa',
    fontSize: 14,
  },
});
