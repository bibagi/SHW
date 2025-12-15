const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Путь к файлу БД
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'database.json');

// Создаём папку data если её нет
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Загрузить данные
function loadDB() {
    try {
        if (fs.existsSync(dbPath)) {
            return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading DB:', e);
    }
    return { users: [], sessions: [], gameHistory: [] };
}

// Сохранить данные
function saveDB(data) {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error saving DB:', e);
    }
}

// Хеширование пароля (простое, без bcrypt)
function hashPassword(password) {
    return crypto.createHash('sha256').update(password + 'wikirace_salt_2024').digest('hex');
}

// Генерация токена
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Регистрация
function register(username, password, displayName) {
    const db = loadDB();

    const existing = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (existing) {
        return { success: false, error: 'Пользователь уже существует' };
    }

    const user = {
        id: Date.now(),
        username: username.toLowerCase(),
        password_hash: hashPassword(password),
        display_name: displayName || username,
        color: '#b45328',
        xp: 0,
        level: 1,
        wins: 0,
        losses: 0,
        total_games: 0,
        solo_games: 0,
        multi_games: 0,
        best_time: null,
        total_clicks: 0,
        streak: 0,
        max_streak: 0,
        title: null, // { name: "Название", color: "#цвет" }
        badges: [],  // [{ id: "id", name: "Название", desc: "Описание", icon: "url", size: 32 }]
        created_at: new Date().toISOString()
    };

    db.users.push(user);

    // Создаём сессию
    const token = generateToken();
    const session = {
        token,
        user_id: user.id,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    db.sessions.push(session);

    saveDB(db);

    return {
        success: true,
        token,
        user: sanitizeUser(user)
    };
}

// Вход
function login(username, password) {
    const db = loadDB();

    const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user) {
        return { success: false, error: 'Неверный логин или пароль' };
    }

    if (user.password_hash !== hashPassword(password)) {
        return { success: false, error: 'Неверный логин или пароль' };
    }

    // Создаём сессию
    const token = generateToken();
    const session = {
        token,
        user_id: user.id,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    db.sessions.push(session);
    saveDB(db);

    return {
        success: true,
        token,
        user: sanitizeUser(user)
    };
}

// Проверка токена
function validateToken(token) {
    if (!token) return null;

    const db = loadDB();
    const session = db.sessions.find(s =>
        s.token === token && new Date(s.expires_at) > new Date()
    );

    if (!session) return null;

    const user = db.users.find(u => u.id === session.user_id);
    return user ? sanitizeUser(user) : null;
}

// Выход
function logout(token) {
    const db = loadDB();
    db.sessions = db.sessions.filter(s => s.token !== token);
    saveDB(db);
}

// Получить пользователя по ID
function getUserById(id) {
    const db = loadDB();
    const user = db.users.find(u => u.id === id);
    return user ? sanitizeUser(user) : null;
}

// Убираем пароль
function sanitizeUser(user) {
    const { password_hash, ...safe } = user;
    return safe;
}

// Обновить профиль
function updateProfile(userId, data) {
    const db = loadDB();
    const userIndex = db.users.findIndex(u => u.id === userId);

    if (userIndex === -1) return null;

    if (data.display_name) {
        db.users[userIndex].display_name = data.display_name;
    }
    if (data.color) {
        db.users[userIndex].color = data.color;
    }

    saveDB(db);
    return sanitizeUser(db.users[userIndex]);
}

// Добавить результат игры
function addGameResult(userId, gameData) {
    const db = loadDB();
    const userIndex = db.users.findIndex(u => u.id === userId);

    if (userIndex === -1) return null;

    const user = db.users[userIndex];
    const { isSolo, isWinner, timeSeconds, clicks, xpGained, targetArticle } = gameData;

    // Записываем в историю
    db.gameHistory.push({
        id: Date.now(),
        user_id: userId,
        is_solo: isSolo,
        is_winner: isWinner,
        time_seconds: timeSeconds,
        clicks,
        xp_gained: xpGained,
        target_article: targetArticle,
        played_at: new Date().toISOString()
    });

    // Обновляем статистику
    user.xp += xpGained;
    user.level = getLevelFromXP(user.xp);
    user.total_games++;
    user.total_clicks += clicks;

    if (isSolo) {
        user.solo_games++;
        user.wins++;
    } else {
        user.multi_games++;
        if (isWinner) {
            user.wins++;
            user.streak++;
            user.max_streak = Math.max(user.max_streak, user.streak);
        } else {
            user.losses++;
            user.streak = 0;
        }
    }

    if (isWinner && (!user.best_time || timeSeconds < user.best_time)) {
        user.best_time = timeSeconds;
    }

    saveDB(db);
    return sanitizeUser(user);
}

// Формула уровня
function getLevelFromXP(xp) {
    let level = 1;
    while ((level + 1) * (level + 1) * 100 <= xp) {
        level++;
    }
    return level;
}

// Топ игроков
function getLeaderboard(limit = 10) {
    const db = loadDB();
    return db.users
        .map(u => ({
            id: u.id,
            display_name: u.display_name,
            color: u.color,
            xp: u.xp,
            level: u.level,
            wins: u.wins,
            total_games: u.total_games
        }))
        .sort((a, b) => b.xp - a.xp)
        .slice(0, limit);
}

// История игр
function getGameHistory(userId, limit = 20) {
    const db = loadDB();
    return db.gameHistory
        .filter(g => g.user_id === userId)
        .sort((a, b) => new Date(b.played_at) - new Date(a.played_at))
        .slice(0, limit);
}

module.exports = {
    register,
    login,
    logout,
    validateToken,
    getUserById,
    updateProfile,
    addGameResult,
    getLeaderboard,
    getGameHistory
};
