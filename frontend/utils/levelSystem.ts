// Level system utilities

export interface LevelInfo {
  title: string;
  icon: string;
  color: string;
}

export const getLevelInfo = (level: number): LevelInfo => {
  if (level === 0) {
    return {
      title: 'Новичок',
      icon: '🌱',
      color: '#95E1D3'
    };
  } else if (level >= 1 && level <= 10) {
    return {
      title: 'Человек, который что-то начал',
      icon: '🚶',
      color: '#4ECDC4'
    };
  } else if (level >= 11 && level <= 20) {
    return {
      title: 'Юный Падаван',
      icon: '⚔️',
      color: '#45B7D1'
    };
  } else if (level >= 21 && level <= 30) {
    return {
      title: 'Воин Кунг-фу',
      icon: '🥋',
      color: '#96CEB4'
    };
  } else if (level >= 31 && level <= 40) {
    return {
      title: 'Машина',
      icon: '🤖',
      color: '#FFEAA7'
    };
  } else if (level >= 41 && level <= 50) {
    return {
      title: 'Волк с Уолл-Стрит',
      icon: '🐺',
      color: '#DFE6E9'
    };
  } else if (level >= 51 && level <= 60) {
    return {
      title: 'Монстр эффективности',
      icon: '👹',
      color: '#A29BFE'
    };
  } else if (level >= 61 && level <= 70) {
    return {
      title: 'Бог дисциплины',
      icon: '⚡',
      color: '#FD79A8'
    };
  } else if (level >= 71 && level <= 80) {
    return {
      title: 'Гранд-мастер',
      icon: '👑',
      color: '#FDCB6E'
    };
  } else if (level >= 81 && level <= 99) {
    return {
      title: 'Легенда',
      icon: '🔥',
      color: '#E17055'
    };
  } else {
    return {
      title: 'Рыцарь Готэма',
      icon: '🦇',
      color: '#2D3436'
    };
  }
};

export const getNextLevelThreshold = (level: number): number => {
  if (level === 0) return 1;
  if (level < 10) return 10;
  if (level < 20) return 20;
  if (level < 30) return 30;
  if (level < 40) return 40;
  if (level < 50) return 50;
  if (level < 60) return 60;
  if (level < 70) return 70;
  if (level < 80) return 80;
  if (level < 100) return 100;
  return level + 10;
};
