# 🎮 RPG Life Gamification App - Installation Guide

## 📦 Что включено:

- ✅ Backend (FastAPI + MongoDB)
- ✅ Frontend (React Native + Expo)
- ✅ Полный исходный код (4700+ строк)
- ✅ Все экраны и компоненты
- ✅ База данных конфигурация

---

## 🚀 Быстрый старт (Local Development)

### 1. Требования:

**Backend:**
- Python 3.9+
- pip

**Frontend:**
- Node.js 18+
- yarn или npm
- Expo CLI

**База данных:**
- MongoDB (локальная или Atlas)

---

### 2. Установка Backend:

```bash
cd backend

# Установка зависимостей
pip install -r requirements.txt

# Настройка .env
# Отредактируйте .env и укажите:
# MONGO_URL=mongodb://localhost:27017
# DB_NAME=rpg_life_db

# Запуск сервера
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Backend запустится на: http://localhost:8001

---

### 3. Установка Frontend:

```bash
cd frontend

# Установка зависимостей
yarn install
# или
npm install

# Настройка .env
# Отредактируйте .env и укажите:
# EXPO_PUBLIC_BACKEND_URL=http://localhost:8001

# Запуск Expo
npx expo start
```

---

### 4. Открытие приложения:

**Вариант A: Веб-браузер**
- Нажмите `w` в терминале Expo
- Откроется в браузере

**Вариант B: Мобильное устройство (Expo Go)**
- Установите Expo Go на телефон
- Отсканируйте QR-код
- Приложение откроется

**Вариант C: Эмулятор**
- iOS: Нажмите `i` (требуется Xcode)
- Android: Нажмите `a` (требуется Android Studio)

---

## 🗃️ База данных

### MongoDB Atlas (бесплатно):

1. Создайте аккаунт на mongodb.com
2. Создайте бесплатный кластер
3. Получите connection string
4. Обновите MONGO_URL в backend/.env

### Local MongoDB:

```bash
# macOS (через Homebrew)
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community

# Ubuntu/Debian
sudo apt-get install mongodb

# Windows
# Скачайте с mongodb.com
```

---

## 📱 Деплой на продакшен

### Backend (Railway/Render/Heroku):

1. Создайте аккаунт на выбранной платформе
2. Подключите GitHub репозиторий
3. Укажите:
   - Root directory: `backend`
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn server:app --host 0.0.0.0 --port $PORT`
4. Добавьте environment variables (MONGO_URL, DB_NAME)

### Frontend (Expo EAS Build):

```bash
# Установка EAS CLI
npm install -g eas-cli

# Логин
eas login

# Настройка проекта
eas build:configure

# Build для iOS
eas build --platform ios

# Build для Android
eas build --platform android

# Деплой
eas submit
```

---

## 🛠️ Разработка

### Backend:

```bash
# Тестирование API
curl http://localhost:8001/api/user
curl http://localhost:8001/api/skills
curl http://localhost:8001/api/missions

# Документация API
http://localhost:8001/docs
```

### Frontend:

```bash
# Очистка кэша
npx expo start -c

# Обновление зависимостей
yarn upgrade

# Проверка типов
npx tsc --noEmit
```

---

## 📚 Структура проекта:

```
rpg-life-app/
├── backend/
│   ├── server.py          # FastAPI сервер
│   ├── requirements.txt   # Python зависимости
│   └── .env              # Конфигурация
├── frontend/
│   ├── app/              # Экраны (Expo Router)
│   │   ├── (tabs)/      # Главные экраны
│   │   └── missions/    # Экраны миссий
│   ├── components/      # Компоненты
│   ├── contexts/        # Контексты
│   ├── utils/           # Утилиты
│   ├── package.json     # Зависимости
│   └── .env            # Конфигурация
└── COMPLETE_CODE.md    # Весь код в одном файле
```

---

## 🔧 Решение проблем

### Backend не запускается:
- Проверьте что MongoDB запущен
- Проверьте MONGO_URL в .env
- Проверьте что порт 8001 свободен

### Frontend не подключается к Backend:
- Проверьте EXPO_PUBLIC_BACKEND_URL в frontend/.env
- На физическом устройстве используйте IP адрес компьютера
- Проверьте что Backend запущен

### Expo не запускается:
- Очистите кэш: `npx expo start -c`
- Переустановите зависимости: `rm -rf node_modules && yarn install`
- Проверьте версию Node.js: `node -v` (нужна 18+)

---

## 📞 Поддержка

Если возникли вопросы:
1. Проверьте COMPLETE_CODE.md - там весь код с комментариями
2. Проверьте документацию API: http://localhost:8001/docs
3. Проверьте логи Backend и Frontend

---

## 🎉 Готово!

Ваше приложение готово к использованию!

**Основные функции:**
- ✅ Создание и редактирование миссий
- ✅ Система задач и шагов
- ✅ Прокачка навыков
- ✅ Система уровней с иконками
- ✅ Streak бонусы (до x40 XP!)
- ✅ Награды за XP
- ✅ Детальная статистика

**Технологии:**
- Backend: Python 3.9+, FastAPI, MongoDB
- Frontend: React Native, Expo, TypeScript
- Architecture: REST API, Async/Await, Context API

Удачи в прокачке жизни! 🚀
