// Wiki Race Game Logic
let gameState = {
    playerName: '',
    playerId: '',
    roomCode: null,
    isHost: false,
    currentArticle: 'Главная страница Wikipedia',
    targetArticle: null,
    clickCount: 0,
    startTime: null,
    gameActive: false,
    ws: null,
    players: [],
    death404Mode: false,
    modifiers: {
        randomStart: false,
        teleport: false,
        timeLimit: false,
        hiddenTarget: false,
        blindKitten: false,
        drunk: false
    },
    timeLimitSeconds: 120,
    teleportInterval: null,
    timeLimitInterval: null,
    onlineCount: 0
};

// Generate unique player ID
function generatePlayerId() {
    let id = localStorage.getItem('playerId');
    if (!id) {
        id = Math.random().toString(36).substring(2, 6).toUpperCase();
        localStorage.setItem('playerId', id);
    }
    return id;
}

// Toggle profile settings popup
function toggleProfileSettings() {
    const popup = document.getElementById('profileSettingsPopup');
    if (popup) {
        popup.classList.toggle('show');
        if (popup.classList.contains('show')) {
            initColorWheel();
        }
    }
}

// Toggle color picker popup
function toggleColorPicker() {
    const popup = document.getElementById('colorPickerPopup');
    if (popup) {
        popup.classList.toggle('show');
        if (popup.classList.contains('show')) {
            initColorWheel();
        }
    }
}

// Copy user tag to clipboard
function copyUserTag() {
    const nick = gameState.playerName || 'Игрок';
    const id = gameState.playerId;
    const fullTag = `${nick}#${id}`;
    
    navigator.clipboard.writeText(fullTag).then(() => {
        // Show notification
        const btn = document.getElementById('copyNickBtn');
        if (btn) {
            const originalText = btn.innerHTML;
            btn.innerHTML = '<span>✓</span>';
            setTimeout(() => {
                btn.innerHTML = originalText;
            }, 1500);
        }
    });
}

// Update user display in navbar
function updateUserDisplay() {
    const nickDisplay = document.getElementById('userNickDisplay');
    const nickTag = document.getElementById('nickTag');
    const fullTag = document.getElementById('fullTag');
    const avatar = document.getElementById('userAvatar');
    const avatarPreview = document.getElementById('avatarPreviewLarge');
    
    const nick = gameState.playerName || 'Игрок';
    const id = gameState.playerId;
    
    if (nickDisplay) nickDisplay.textContent = nick;
    if (nickTag) nickTag.textContent = `#${id}`;
    if (fullTag) fullTag.textContent = `${nick}#${id}`;
    if (avatar) avatar.textContent = nick.charAt(0).toUpperCase();
    if (avatarPreview) avatarPreview.textContent = nick.charAt(0).toUpperCase();
}

// Update online count
function updateOnlineCount(count) {
    gameState.onlineCount = count;
    const countEl = document.getElementById('onlineCount');
    if (countEl) {
        countEl.textContent = count;
    }
}

// WebSocket connection
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    gameState.ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    gameState.ws.onopen = () => {
        console.log('✓ WebSocket connected');
    };
    
    gameState.ws.onmessage = (event) => {
        console.log('📩 Raw message:', event.data);
        const message = JSON.parse(event.data);
        handleServerMessage(message);
    };
    
    gameState.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
    
    gameState.ws.onclose = () => {
        console.log('WebSocket disconnected');
    };
}

// Handle server messages
function handleServerMessage(message) {
    console.log('Received message:', message.type, message);
    switch (message.type) {
        case 'room_created':
            console.log('Room created:', message.code);
            gameState.roomCode = message.code;
            gameState.isHost = true;
            showRoomPanel(message.code, message.players, true);
            break;
        case 'room_joined':
            console.log('Room joined:', message.code, message.players);
            gameState.roomCode = message.code;
            gameState.isHost = false;
            showRoomPanel(message.code, message.players, false);
            break;
        case 'player_joined':
            updatePlayersListPanel(message.players);
            break;
        case 'player_left':
            updatePlayersListPanel(message.players);
            break;
        case 'lobby_ready_update':
            updatePlayersListPanel(message.players);
            break;
        case 'players_update':
            updatePlayersListPanel(message.players);
            break;
        case 'game_started':
            gameState.targetArticle = message.targetArticle;
            // Apply game settings from server
            if (message.death404Mode !== undefined) {
                gameState.death404Mode = message.death404Mode;
            }
            if (message.modifiers) {
                gameState.modifiers = { ...message.modifiers };
            }
            if (message.timeLimitSeconds !== undefined) {
                gameState.timeLimitSeconds = message.timeLimitSeconds;
            }
            startCountdown();
            break;
        case 'game_finished':
            // All players see the results
            console.log('🎉 Game finished! Winner:', message.winner, 'Target:', message.targetArticle);
            gameState.gameActive = false;
            gameState.targetArticle = message.targetArticle;
            console.log('Calling showMultiplayerResults...');
            showMultiplayerResults(message.winner, message.time, message.targetArticle);
            console.log('showMultiplayerResults called');
            break;
        case 'player_finished':
            addPlayerResult(message.playerName, message.clicks, message.time);
            break;
        case 'player_progress':
            updatePlayerProgress(message.playerName, message.currentArticle, message.clicks);
            break;
        case 'player_ready':
            updateReadyStatus(message.players);
            break;
        case 'all_ready':
            enableStartButton();
            break;
        case 'host_to_lobby':
            showHostLobbyNotification(message.countdown);
            break;
        case 'return_to_lobby':
            returnToLobbyWithRoom(message.code, message.players);
            break;
        case 'room_settings':
            applyRoomSettings(message);
            break;
        case 'error':
            alert(message.message);
            break;
    }
}

// Update players list in lobby (old)
function updatePlayersList(players) {
    gameState.players = players;
    const list = document.getElementById('playersList');
    if (list) {
        list.innerHTML = '<h3>👥 Игроки:</h3>' + 
            players.map(p => `<div class="player-item">${p.name}</div>`).join('');
    }
    // Also update panel
    updatePlayersListPanel(players);
}

// Slide to room panel
function slideToRoom() {
    const slideMenu = document.getElementById('slideMenu');
    const slideRoom = document.getElementById('slideRoom');
    const slideJoin = document.getElementById('slideJoin');
    
    // Hide menu
    if (slideMenu) {
        slideMenu.classList.add('slide-left');
        slideMenu.classList.remove('active');
    }
    // Hide and slide join panel left
    if (slideJoin) {
        slideJoin.classList.add('slide-left');
        slideJoin.classList.remove('active');
    }
    // Show room
    if (slideRoom) slideRoom.classList.add('active');
}

// Slide to join panel
function slideToJoin() {
    const slideMenu = document.getElementById('slideMenu');
    const slideJoin = document.getElementById('slideJoin');
    
    if (slideMenu) slideMenu.classList.add('slide-left');
    if (slideMenu) slideMenu.classList.remove('active');
    if (slideJoin) slideJoin.classList.add('active');
}

// Slide back to menu
function slideToMenu() {
    const slideMenu = document.getElementById('slideMenu');
    const slideRoom = document.getElementById('slideRoom');
    const slideJoin = document.getElementById('slideJoin');
    
    if (slideMenu) {
        slideMenu.classList.remove('slide-left');
        slideMenu.classList.add('active');
    }
    if (slideRoom) slideRoom.classList.remove('active');
    if (slideJoin) {
        slideJoin.classList.remove('active');
        slideJoin.classList.remove('slide-left');
    }
}

// Max players selector
let maxPlayers = 8;

function showMaxPlayersPopup() {
    if (!gameState.isHost) return;
    const popup = document.getElementById('maxPlayersPopup');
    if (popup) popup.classList.add('show');
}

function hideMaxPlayersPopup() {
    const popup = document.getElementById('maxPlayersPopup');
    if (popup) popup.classList.remove('show');
}

function selectMaxPlayers(value) {
    maxPlayers = value;
    // Update UI
    document.querySelectorAll('.wheel-option').forEach(opt => {
        opt.classList.toggle('selected', parseInt(opt.dataset.value) === value);
    });
}

function confirmMaxPlayers() {
    const display = document.getElementById('maxPlayersDisplay');
    if (display) display.textContent = maxPlayers;
    hideMaxPlayersPopup();
    
    // Notify server if in room
    if (gameState.ws && gameState.roomCode && gameState.isHost) {
        gameState.ws.send(JSON.stringify({
            type: 'room_settings',
            maxPlayers: maxPlayers
        }));
    }
}

// Show room panel on the right
function showRoomPanel(code, players, isHost) {
    console.log('showRoomPanel called:', code, players, isHost);
    
    // Slide to room
    slideToRoom();
    
    const codeEl = document.getElementById('roomCodeDisplay');
    codeEl.textContent = code;
    codeEl.dataset.code = code; // Store for copy function
    
    // Show settings and start button only for host
    const btnReady = document.getElementById('btnReadyLobby');
    const death404Btn = document.getElementById('death404Toggle');
    const modifiersTrigger = document.getElementById('modifiersTrigger');
    
    if (isHost) {
        document.getElementById('btnStartGamePanel').classList.remove('hidden');
        if (btnReady) btnReady.classList.add('hidden');
        // Enable modifier checkboxes for host
        document.querySelectorAll('.modifier-checkbox').forEach(cb => cb.disabled = false);
        // Enable death404 button for host
        if (death404Btn) {
            death404Btn.disabled = false;
            death404Btn.style.opacity = '1';
            death404Btn.style.cursor = 'pointer';
        }
        // Enable modifiers trigger for host
        if (modifiersTrigger) {
            modifiersTrigger.style.pointerEvents = 'auto';
            modifiersTrigger.style.opacity = '1';
        }
    } else {
        document.getElementById('btnStartGamePanel').classList.add('hidden');
        // Show ready button for non-host
        if (btnReady) {
            btnReady.classList.remove('hidden');
            btnReady.disabled = false;
            btnReady.textContent = '✓ Готов';
            btnReady.classList.remove('btn-ready-active');
        }
        // Disable modifier checkboxes for non-host (they can only view)
        document.querySelectorAll('.modifier-checkbox').forEach(cb => cb.disabled = true);
        // Disable death404 button for non-host
        if (death404Btn) {
            death404Btn.disabled = true;
            death404Btn.style.opacity = '0.5';
            death404Btn.style.cursor = 'not-allowed';
        }
        // Disable modifiers trigger for non-host (can still view)
        if (modifiersTrigger) {
            modifiersTrigger.style.pointerEvents = 'auto';
            modifiersTrigger.style.opacity = '0.7';
        }
    }
    
    updatePlayersListPanel(players);
}

// Hide room panel
function hideRoomPanel() {
    // Slide back to menu
    slideToMenu();
    
    // Hide modifiers panel
    hideModifiersPanel();
    
    // Reset death mode
    toggleDeath404Mode(false);
    
    gameState.roomCode = null;
    gameState.isHost = false;
}

// Show modifiers modal
function showModifiersPanel() {
    const modal = document.getElementById('modifiersModal');
    if (modal) {
        modal.classList.add('show');
        updateModifiersModalState();
    }
}

// Hide modifiers modal
function hideModifiersPanel() {
    const modal = document.getElementById('modifiersModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

// Show how to play modal
function showHowToPlayModal() {
    const modal = document.getElementById('howToPlayModal');
    if (modal) {
        modal.classList.add('show');
    }
}

// Hide how to play modal
function hideHowToPlayModal() {
    const modal = document.getElementById('howToPlayModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

// Update modifiers modal state
function updateModifiersModalState() {
    document.querySelectorAll('.modifier-row').forEach(row => {
        const modName = row.dataset.modifier;
        const btn = row.querySelector('.toggle-btn');
        const isActive = gameState.modifiers[modName];
        
        row.classList.toggle('active', isActive);
        if (btn) {
            btn.classList.toggle('active', isActive);
            btn.textContent = isActive ? 'ON' : 'OFF';
        }
    });
    
    // Update count
    const count = Object.values(gameState.modifiers).filter(v => v).length;
    const countEl = document.getElementById('activeModifiersCount');
    if (countEl) countEl.textContent = count;
    
    // Update trigger count
    const triggerCount = document.getElementById('modifiersCount');
    if (triggerCount) {
        triggerCount.textContent = count;
        triggerCount.style.display = count > 0 ? 'inline' : 'none';
    }
    
    // Show/hide time limit input
    const timeLimitModal = document.getElementById('timeLimitModal');
    if (timeLimitModal) {
        timeLimitModal.classList.toggle('hidden', !gameState.modifiers.timeLimit);
    }
}

// Modifier descriptions
const modifierDescriptions = {
    randomStart: {
        title: '🎲 Случайный старт',
        desc: 'Вместо главной страницы Википедии вы начинаете со случайной статьи. Это делает игру непредсказуемой и требует больше навыков навигации.'
    },
    teleport: {
        title: '🌀 Телепорт',
        desc: 'Каждые 15 секунд вас автоматически перемещает на случайную страницу. Нужно действовать быстро и адаптироваться к новым условиям!'
    },
    timeLimit: {
        title: '⏱️ Лимит времени',
        desc: 'У вас ограниченное время на поиск целевой статьи. Если время истечёт — игра окончена. Настройте время в поле справа.'
    },
    hiddenTarget: {
        title: '🙈 Без заголовка',
        desc: 'Название целевой статьи скрыто! Вы видите только эмодзи-подсказку и описание. Придётся догадываться, что искать.'
    },
    blindKitten: {
        title: '🐱 Слепой котёнок',
        desc: 'Весь текст статей скрыт, видны только ссылки и заголовки. Навигация становится намного сложнее!'
    },
    drunk: {
        title: '🍺 Алкоголик-мод',
        desc: 'Текст статей "пьяный" — буквы меняются местами, появляются опечатки и перевёрнутые слова. Читать становится... интересно.'
    }
};

// Show modifier details
function showModifierDetails(modName) {
    const details = document.getElementById('modifierDetails');
    const info = modifierDescriptions[modName];
    
    if (details && info) {
        details.innerHTML = `
            <div class="modifier-detail-content">
                <h3>${info.title}</h3>
                <p>${info.desc}</p>
            </div>
        `;
    }
}

// Toggle modifier from modal
function toggleModifierFromModal(modName) {
    const newState = !gameState.modifiers[modName];
    gameState.modifiers[modName] = newState;
    
    // Special handling for time limit
    if (modName === 'timeLimit') {
        const timeLimitInput = document.getElementById('timeLimitValueModal');
        if (timeLimitInput) {
            gameState.timeLimitSeconds = parseInt(timeLimitInput.value) || 120;
        }
    }
    
    updateModifiersModalState();
    updateActiveModifiersTags();
    
    // Notify other players
    if (gameState.ws && gameState.roomCode && gameState.isHost) {
        gameState.ws.send(JSON.stringify({
            type: 'room_settings',
            death404Mode: gameState.death404Mode,
            modifiers: gameState.modifiers,
            timeLimitSeconds: gameState.timeLimitSeconds
        }));
    }
}

// Global keyboard handler
function handleGlobalKeyboard(e) {
    // ESC - close modals
    if (e.key === 'Escape') {
        const modifiersModal = document.getElementById('modifiersModal');
        const howToPlayModal = document.getElementById('howToPlayModal');
        
        if (modifiersModal?.classList.contains('show')) {
            hideModifiersPanel();
            e.preventDefault();
        } else if (howToPlayModal?.classList.contains('show')) {
            hideHowToPlayModal();
            e.preventDefault();
        }
    }
    
    // Enter - confirm in modals
    if (e.key === 'Enter') {
        const modifiersModal = document.getElementById('modifiersModal');
        if (modifiersModal?.classList.contains('show')) {
            hideModifiersPanel();
            e.preventDefault();
        }
    }
}

// Update players list in panel
function updatePlayersListPanel(players) {
    console.log('updatePlayersListPanel:', players);
    gameState.players = players;
    const list = document.getElementById('playersListPanel');
    const playersCount = document.getElementById('playersCount');
    
    // Update players count
    const playersCountEl = document.getElementById('playersCount');
    if (playersCountEl) {
        playersCountEl.textContent = players.length;
    }
    
    if (list) {
        list.innerHTML = players.map((p, index) => {
            const isHost = index === 0;
            const color = p.color || '#666';
            const isReady = p.ready || false;
            
            // Status icon
            let statusClass = '';
            let statusIcon = '○';
            if (isHost) {
                statusClass = 'host';
                statusIcon = '★';
            } else if (isReady) {
                statusClass = 'ready';
                statusIcon = '✓';
            }
            
            return `
                <div class="player-item ${isHost ? 'is-host' : ''}">
                    <div class="player-item-avatar" style="background: ${color};">
                        ${p.name.charAt(0).toUpperCase()}
                        ${isHost ? '<span class="host-crown">👑</span>' : ''}
                    </div>
                    <div class="player-item-info">
                        <div class="player-item-name">${p.name}</div>
                        ${isHost ? '<div class="player-item-role">Хост</div>' : ''}
                    </div>
                    <div class="player-item-status ${statusClass}">${statusIcon}</div>
                </div>
            `;
        }).join('');
    }
    
    // Update ready progress bar
    updateReadyProgress(players);
    
    // Update start button state for host
    updateStartButtonState(players);
}

// Update ready progress bar
function updateReadyProgress(players) {
    const progressFill = document.getElementById('readyProgressFill');
    const readyText = document.getElementById('readyText');
    
    if (!progressFill || !readyText) return;
    
    const nonHostPlayers = players.slice(1);
    const readyCount = nonHostPlayers.filter(p => p.ready).length;
    const totalNonHost = nonHostPlayers.length;
    
    if (totalNonHost === 0) {
        progressFill.style.width = '100%';
        readyText.textContent = 'Ожидание других игроков...';
    } else {
        const percent = (readyCount / totalNonHost) * 100;
        progressFill.style.width = `${percent}%`;
        
        if (readyCount === totalNonHost) {
            readyText.textContent = 'Все готовы! Можно начинать';
        } else {
            readyText.textContent = `Готовы: ${readyCount} из ${totalNonHost}`;
        }
    }
}

// Update start button state based on ready status
function updateStartButtonState(players) {
    const btnStart = document.getElementById('btnStartGamePanel');
    const btnReady = document.getElementById('btnReadyLobby');
    const roomSettings = document.getElementById('roomSettings');
    
    if (!gameState.isHost) {
        // Non-host sees ready button, hides settings
        if (btnReady) btnReady.classList.remove('hidden');
        if (btnStart) btnStart.classList.add('hidden');
        if (roomSettings) roomSettings.style.display = 'none';
        return;
    }
    
    // Host logic - show settings
    if (btnReady) btnReady.classList.add('hidden');
    if (btnStart) btnStart.classList.remove('hidden');
    if (roomSettings) roomSettings.style.display = 'block';
    
    // Check if all non-host players are ready
    const nonHostPlayers = players.slice(1);
    const allReady = nonHostPlayers.length === 0 || nonHostPlayers.every(p => p.ready);
    
    if (btnStart) {
        btnStart.disabled = !allReady;
        if (allReady && nonHostPlayers.length > 0) {
            btnStart.textContent = 'Начать игру';
        } else if (nonHostPlayers.length === 0) {
            btnStart.textContent = 'Начать игру';
            btnStart.disabled = false;
        } else {
            btnStart.textContent = 'Ожидание готовности...';
        }
    }
}

// Send ready status in lobby
function sendReadyLobby() {
    if (gameState.ws && gameState.roomCode && !gameState.isHost) {
        gameState.ws.send(JSON.stringify({
            type: 'lobby_ready',
            playerName: gameState.playerName
        }));
        
        // Update button
        const btnReady = document.getElementById('btnReadyLobby');
        if (btnReady) {
            btnReady.textContent = '✓ Готов!';
            btnReady.disabled = true;
            btnReady.classList.add('btn-ready-active');
        }
    }
}

// Copy room code from panel
function copyRoomCodePanel() {
    const el = document.getElementById('roomCodeDisplay');
    // Use stored room code, not current text (which might be "Скопировано!")
    const code = gameState.roomCode || el.dataset.code || el.textContent;
    
    // Don't copy if it's already showing "Скопировано!"
    if (code === 'Скопировано!' || !code || code === '------') return;
    
    navigator.clipboard.writeText(code).then(() => {
        // Store original code in dataset
        if (!el.dataset.code) {
            el.dataset.code = code;
        }
        el.textContent = 'Скопировано!';
        setTimeout(() => {
            el.textContent = el.dataset.code || gameState.roomCode;
        }, 1500);
    });
}

// Update player progress during game
function updatePlayerProgress(playerName, article, clicks) {
    const list = document.getElementById('progressList');
    let item = list.querySelector(`[data-player="${playerName}"]`);
    if (!item) {
        item = document.createElement('div');
        item.className = 'progress-item';
        item.setAttribute('data-player', playerName);
        list.appendChild(item);
    }
    item.innerHTML = `<strong>${playerName}</strong><br>Статья: ${article}<br>Переходов: ${clicks}`;
}

// Screen management
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// Load nickname from localStorage
function loadNickname() {
    const saved = localStorage.getItem('wikiRaceNickname');
    gameState.playerId = generatePlayerId();
    
    if (saved) {
        gameState.playerName = saved;
        const playerNameInput = document.getElementById('playerName');
        const nickInput = document.getElementById('nickInput');
        if (playerNameInput) playerNameInput.value = saved;
        if (nickInput) nickInput.value = saved;
    } else {
        gameState.playerName = 'Игрок';
    }
    
    updateUserDisplay();
}

// Save nickname to localStorage
function saveNickname(name) {
    gameState.playerName = name;
    localStorage.setItem('wikiRaceNickname', name);
    
    // Update hidden input for compatibility
    const playerNameInput = document.getElementById('playerName');
    if (playerNameInput) playerNameInput.value = name;
    
    updateUserDisplay();
}

// Get leaderboard from localStorage
function getLeaderboard() {
    const saved = localStorage.getItem('wikiRaceLeaderboard');
    return saved ? JSON.parse(saved) : [];
}

// Save leaderboard to localStorage
function saveLeaderboard(leaderboard) {
    localStorage.setItem('wikiRaceLeaderboard', JSON.stringify(leaderboard));
}

// Add result to leaderboard
function addToLeaderboard(playerName, time) {
    const leaderboard = getLeaderboard();
    const timeInSeconds = timeToSeconds(time);
    
    leaderboard.push({
        name: playerName,
        time: time,
        seconds: timeInSeconds,
        date: new Date().toLocaleString('ru-RU')
    });
    
    // Sort by time (ascending)
    leaderboard.sort((a, b) => a.seconds - b.seconds);
    
    // Keep only top 10
    leaderboard.splice(10);
    
    saveLeaderboard(leaderboard);
}

// Convert time string to seconds
function timeToSeconds(timeStr) {
    const parts = timeStr.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

// Display leaderboard
function displayLeaderboard() {
    const leaderboard = getLeaderboard();
    const table = document.getElementById('leaderboardTable');
    
    if (leaderboard.length === 0) {
        table.innerHTML = '<p style="text-align: center; color: #888;">Нет результатов</p>';
        return;
    }
    
    table.innerHTML = leaderboard.map((entry, index) => `
        <div class="leaderboard-row">
            <span class="rank">#${index + 1}</span>
            <span class="name">${entry.name}</span>
            <span class="time">${entry.time}</span>
        </div>
    `).join('');
}

// Get random Wikipedia article
async function getRandomArticle() {
    try {
        const url = 'https://ru.wikipedia.org/w/api.php?action=query&format=json&list=random&rnnamespace=0&rnlimit=1&origin=*';
        console.log('Fetching random article...');
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.query && data.query.random && data.query.random[0]) {
            const title = data.query.random[0].title;
            console.log('✓ Random article:', title);
            return title;
        }
    } catch (e) {
        console.error('Error fetching random article:', e);
    }
    
    // Fallback articles
    const fallbacks = ['Россия', 'Москва', 'Википедия', 'Интернет', 'Компьютер'];
    const fallback = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    console.log('Using fallback:', fallback);
    return fallback;
}

// Get article description - first 2-3 sentences
async function getArticleDescription(articleTitle) {
    try {
        const response = await fetch(`https://ru.wikipedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(articleTitle)}&prop=extracts&exintro=true&explaintext=true&origin=*`);
        const data = await response.json();
        if (data.query && data.query.pages) {
            const page = Object.values(data.query.pages)[0];
            if (page.extract) {
                // Get first 2-3 sentences
                const sentences = page.extract.split(/[.!?]+/).slice(0, 3).join('. ').trim();
                return sentences.length > 0 ? sentences + '.' : page.extract.substring(0, 200) + '...';
            }
        }
    } catch (e) {
        console.error('Error fetching article description:', e);
    }
    return 'Описание недоступно';
}

// Single player game
async function startSinglePlayer() {
    gameState.playerName = document.getElementById('playerName').value || 'Игрок';
    if (!gameState.playerName) {
        alert('Введите имя!');
        return;
    }
    
    // Save nickname
    saveNickname(gameState.playerName);
    
    // Show loading
    showScreen('countdown');
    document.getElementById('countdownNumber').textContent = 'Загрузка...';
    
    // Get target article (custom or random)
    try {
        gameState.targetArticle = await getTargetArticle();
        console.log('✓ Target article loaded:', gameState.targetArticle);
    } catch (e) {
        console.error('✗ Error loading article:', e);
        gameState.targetArticle = 'Альберт Эйнштейн';
    }
    
    // Start countdown
    startCountdown();
}

// Create multiplayer room
function createRoom() {
    gameState.playerName = document.getElementById('playerName').value || 'Игрок';
    if (!gameState.playerName) {
        alert('Введите имя!');
        return;
    }
    
    // Save nickname
    saveNickname(gameState.playerName);
    
    const customization = getUserCustomization();
    
    if (!gameState.ws || gameState.ws.readyState !== WebSocket.OPEN) {
        connectWebSocket();
        setTimeout(() => {
            gameState.ws.send(JSON.stringify({
                type: 'create_room',
                playerName: gameState.playerName,
                color: customization.color,
                borderStyle: customization.borderStyle,
                avatarUrl: customization.avatarUrl
            }));
        }, 500);
    } else {
        gameState.ws.send(JSON.stringify({
            type: 'create_room',
            playerName: gameState.playerName,
            color: customization.color,
            borderStyle: customization.borderStyle,
            avatarUrl: customization.avatarUrl
        }));
    }
}

// Join room form
function toggleJoinForm() {
    const form = document.getElementById('joinRoomForm');
    form.classList.toggle('show');
}

// Join room
function joinRoomConfirm() {
    gameState.playerName = document.getElementById('playerName').value || 'Игрок';
    const code = document.getElementById('roomCodeInput').value.toUpperCase();
    
    if (!gameState.playerName) {
        alert('Введите имя!');
        return;
    }
    if (!code || code.length !== 6) {
        alert('Введите корректный код комнаты!');
        return;
    }
    
    // Check if already in this room
    if (gameState.roomCode === code) {
        alert('Вы уже в этой комнате!');
        return;
    }
    
    // Save nickname
    saveNickname(gameState.playerName);
    
    const customization = getUserCustomization();
    
    if (!gameState.ws || gameState.ws.readyState !== WebSocket.OPEN) {
        connectWebSocket();
        setTimeout(() => {
            gameState.ws.send(JSON.stringify({
                type: 'join_room',
                code,
                playerName: gameState.playerName,
                color: customization.color,
                borderStyle: customization.borderStyle,
                avatarUrl: customization.avatarUrl
            }));
        }, 500);
    } else {
        gameState.ws.send(JSON.stringify({
            type: 'join_room',
            code,
            playerName: gameState.playerName,
            color: customization.color,
            borderStyle: customization.borderStyle,
            avatarUrl: customization.avatarUrl
        }));
    }
    
    // Slide will happen when room_joined message is received
}

// Start game (host only)
async function startGameHost() {
    if (!gameState.isHost) return;
    
    const startArticle = 'Главная страница Wikipedia';
    const targetArticle = await getRandomArticle();
    
    gameState.ws.send(JSON.stringify({
        type: 'start_game',
        startArticle,
        targetArticle
    }));
}

// Countdown before game
function startCountdown() {
    showScreen('countdown');
    document.getElementById('countdownTarget').textContent = gameState.targetArticle;
    
    // 5 seconds in death mode, 3 seconds normally
    let count = gameState.death404Mode ? 5 : 3;
    const countdownEl = document.getElementById('countdownNumber');
    countdownEl.textContent = count;
    
    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownEl.textContent = count;
        } else {
            clearInterval(interval);
            startGame();
        }
    }, 1000);
}

// Start actual game
async function startGame() {
    gameState.gameActive = true;
    gameState.startTime = Date.now();
    gameState.currentArticle = 'Главная страница Wikipedia';
    
    // Clear any existing teleport interval
    if (gameState.teleportInterval) {
        clearInterval(gameState.teleportInterval);
        gameState.teleportInterval = null;
    }
    
    console.log('🎮 Game started! Target:', gameState.targetArticle);
    console.log('Modifiers:', gameState.modifiers);
    
    showScreen('game');
    
    // Hidden target modifier - show only emoji hint
    if (gameState.modifiers.hiddenTarget) {
        document.getElementById('targetTitle').textContent = '🎯 ❓❓❓';
        document.getElementById('targetDescription').textContent = 'Название цели скрыто! Найди её по описанию...';
        // Show only first sentence as hint
        const description = await getArticleDescription(gameState.targetArticle);
        const firstSentence = description.split('.')[0] + '...';
        document.getElementById('targetDescription').textContent = firstSentence;
    } else {
        document.getElementById('targetTitle').textContent = gameState.targetArticle;
        // Load article description
        const description = await getArticleDescription(gameState.targetArticle);
        document.getElementById('targetDescription').textContent = description;
    }
    
    // Blind kitten modifier - add CSS class to hide text
    if (gameState.modifiers.blindKitten) {
        document.body.classList.add('blind-kitten-mode');
    } else {
        document.body.classList.remove('blind-kitten-mode');
    }
    
    // Drunk modifier - add CSS class for drunk effect
    if (gameState.modifiers.drunk) {
        document.body.classList.add('drunk-mode');
    } else {
        document.body.classList.remove('drunk-mode');
    }
    
    // Apply modifiers
    let startPage = 'Заглавная_страница';
    
    // Random start modifier
    if (gameState.modifiers.randomStart) {
        console.log('🎲 Random start modifier active');
        startPage = await getRandomArticle();
        gameState.currentArticle = startPage;
    }
    
    // Load Wikipedia
    loadWikipediaArticle(startPage);
    
    // Teleport modifier - random page every 15 seconds
    if (gameState.modifiers.teleport) {
        console.log('🌀 Teleport modifier active');
        gameState.teleportInterval = setInterval(async () => {
            if (!gameState.gameActive) {
                clearInterval(gameState.teleportInterval);
                return;
            }
            const randomPage = await getRandomArticle();
            console.log('🌀 Teleporting to:', randomPage);
            loadWikipediaArticle(randomPage);
            showTeleportNotification();
        }, 15000);
    }
    
    // Time limit modifier
    if (gameState.modifiers.timeLimit) {
        console.log('⏱️ Time limit modifier active:', gameState.timeLimitSeconds, 'seconds');
        startTimeLimitCountdown();
    }
    
    // Start tracking navigation
    trackIframeNavigation();
    
    // Start timer
    startTimer();
}

// Show teleport notification
function showTeleportNotification() {
    let notification = document.getElementById('teleportNotification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'teleportNotification';
        notification.className = 'teleport-notification';
        document.body.appendChild(notification);
    }
    notification.innerHTML = '🌀 Телепорт!';
    notification.classList.add('show');
    setTimeout(() => notification.classList.remove('show'), 2000);
}

// Start time limit countdown
function startTimeLimitCountdown() {
    // Clear existing interval
    if (gameState.timeLimitInterval) {
        clearInterval(gameState.timeLimitInterval);
    }
    
    // This interval only checks for game over, display is handled by startTimer
    gameState.timeLimitInterval = setInterval(() => {
        if (!gameState.gameActive) {
            clearInterval(gameState.timeLimitInterval);
            return;
        }
        
        const elapsed = Math.floor((Date.now() - gameState.startTime) / 1000);
        const remainingTime = gameState.timeLimitSeconds - elapsed;
        
        // Time's up!
        if (remainingTime <= 0) {
            clearInterval(gameState.timeLimitInterval);
            gameOver('Время вышло!');
        }
    }, 1000);
}

// Game over (for death mode failures)
function gameOver(reason) {
    if (!gameState.gameActive) return;
    
    gameState.gameActive = false;
    
    // Clear intervals
    if (gameState.teleportInterval) {
        clearInterval(gameState.teleportInterval);
    }
    if (gameState.timeLimitInterval) {
        clearInterval(gameState.timeLimitInterval);
    }
    
    // Show game over overlay
    let overlay = document.getElementById('gameOverOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'gameOverOverlay';
        overlay.className = 'game-over-overlay';
        overlay.innerHTML = `
            <div class="game-over-text">💀 GAME OVER</div>
            <div class="game-over-reason" id="gameOverReason"></div>
            <button class="btn btn-primary" onclick="closeGameOver()">В меню</button>
        `;
        document.body.appendChild(overlay);
    }
    
    document.getElementById('gameOverReason').textContent = reason;
    overlay.classList.add('show');
    
    console.log('💀 Game Over:', reason);
}

// Close game over overlay
function closeGameOver() {
    const overlay = document.getElementById('gameOverOverlay');
    if (overlay) {
        overlay.classList.remove('show');
    }
    backToLobby();
}

// Load Wikipedia article in iframe
function loadWikipediaArticle(articleTitle) {
    const iframe = document.getElementById('wikiFrame');
    iframe.src = `https://ru.wikipedia.org/wiki/${encodeURIComponent(articleTitle)}`;
}

// Track iframe navigation - автоматическое определение победы
function trackIframeNavigation() {
    const iframe = document.getElementById('wikiFrame');
    
    // Метод 1: Проверяем через интервал
    const checkInterval = setInterval(() => {
        if (!gameState.gameActive) {
            clearInterval(checkInterval);
            return;
        }
        
        try {
            // Пробуем получить URL из iframe
            const currentUrl = iframe.contentWindow.location.href;
            const articleMatch = currentUrl.match(/\/wiki\/([^#?]+)/);
            if (articleMatch) {
                const currentArticle = decodeURIComponent(articleMatch[1].replace(/_/g, ' '));
                console.log('📄 Current article:', currentArticle);
                checkTargetReached(currentArticle);
            }
        } catch (e) {
            // CORS блокирует - это нормально
        }
    }, 1000);
    
    // Метод 2: Слушаем событие load iframe
    iframe.onload = function() {
        if (!gameState.gameActive) return;
        
        // Небольшая задержка чтобы страница загрузилась
        setTimeout(() => {
            try {
                const currentUrl = iframe.contentWindow.location.href;
                const articleMatch = currentUrl.match(/\/wiki\/([^#?]+)/);
                if (articleMatch) {
                    const currentArticle = decodeURIComponent(articleMatch[1].replace(/_/g, ' '));
                    console.log('📄 Page loaded:', currentArticle);
                    checkTargetReached(currentArticle);
                }
            } catch (e) {
                console.log('CORS blocked, trying alternative...');
                // Альтернатива: проверяем через title документа
                try {
                    const title = iframe.contentDocument?.title || '';
                    if (title) {
                        // Wikipedia title format: "Article Name — Википедия"
                        const articleName = title.replace(' — Википедия', '').trim();
                        console.log('📄 From title:', articleName);
                        checkTargetReached(articleName);
                    }
                } catch (e2) {
                    // Полностью заблокировано CORS
                }
            }
        }, 500);
    };
    
    console.log('✓ Auto-detection enabled. Game will finish automatically when target is reached.');
}

// Normalize article name for comparison
function normalizeArticleName(name) {
    return name.toLowerCase().replace(/[\s_]/g, '').replace(/\([^)]*\)/g, '').trim();
}

// Check if target reached by description text match
function checkTargetByDescription() {
    if (!gameState.gameActive) return;
    
    const iframe = document.getElementById('wikiFrame');
    const descriptionEl = document.getElementById('targetDescription');
    
    if (!descriptionEl || !iframe) return;
    
    const targetDescription = descriptionEl.textContent.trim();
    if (!targetDescription || targetDescription.length < 50) return; // Too short to be reliable
    
    try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) return;
        
        // Get first paragraph of the article
        const firstParagraph = iframeDoc.querySelector('#mw-content-text .mw-parser-output > p:not(.mw-empty-elt)');
        if (!firstParagraph) return;
        
        const pageText = firstParagraph.textContent.trim();
        if (!pageText) return;
        
        // Normalize both texts for comparison
        const normalizeText = (text) => {
            return text
                .toLowerCase()
                .replace(/\[\d+\]/g, '') // Remove citation numbers [1], [2], etc.
                .replace(/[^\wа-яё\s]/gi, '') // Keep only letters, numbers, spaces
                .replace(/\s+/g, ' ')
                .trim();
        };
        
        const normalizedDescription = normalizeText(targetDescription);
        const normalizedPageText = normalizeText(pageText);
        
        // Check if description is contained in page text (at least 80% match)
        // Split into words and check overlap
        const descWords = normalizedDescription.split(' ').filter(w => w.length > 3);
        const pageWords = normalizedPageText.split(' ');
        
        if (descWords.length < 5) return; // Not enough words to compare
        
        let matchCount = 0;
        for (const word of descWords) {
            if (pageWords.includes(word)) {
                matchCount++;
            }
        }
        
        const matchRatio = matchCount / descWords.length;
        console.log(`📝 Description match: ${(matchRatio * 100).toFixed(1)}% (${matchCount}/${descWords.length} words)`);
        
        // If 80% or more words match, consider it a win
        if (matchRatio >= 0.8) {
            console.log('🎉 TARGET REACHED BY DESCRIPTION MATCH! 🎉');
            finishGame();
        }
    } catch (e) {
        // CORS or other error - ignore
        console.log('Could not check description:', e.message);
    }
}

// Disqualify player
function disqualify(reason) {
    gameState.gameActive = false;
    alert(reason);
    showResults(gameState.clickCount, '∞', gameState.targetArticle);
}

// Timer
function startTimer() {
    const timerEl = document.getElementById('timer');
    
    // If time limit modifier is active, show countdown instead
    if (gameState.modifiers.timeLimit) {
        let remainingTime = gameState.timeLimitSeconds;
        
        const interval = setInterval(() => {
            if (!gameState.gameActive) {
                clearInterval(interval);
                return;
            }
            
            const elapsed = Math.floor((Date.now() - gameState.startTime) / 1000);
            remainingTime = gameState.timeLimitSeconds - elapsed;
            
            if (remainingTime <= 0) {
                remainingTime = 0;
                timerEl.textContent = '00:00';
                clearInterval(interval);
                return;
            }
            
            const minutes = Math.floor(remainingTime / 60);
            const seconds = remainingTime % 60;
            timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            
            // Warning when 30 seconds left
            if (remainingTime <= 30) {
                timerEl.classList.add('time-warning');
            }
        }, 100);
    } else {
        // Normal timer - count up
        const interval = setInterval(() => {
            if (!gameState.gameActive) {
                clearInterval(interval);
                return;
            }
            
            const elapsed = Math.floor((Date.now() - gameState.startTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }, 100);
    }
}

// Check if target reached
function checkTargetReached(articleTitle) {
    if (!gameState.gameActive) return;
    
    const normalizedTarget = gameState.targetArticle
        .toLowerCase()
        .replace(/[\s_\-()]/g, '')
        .trim();
    
    const normalizedCurrent = articleTitle
        .toLowerCase()
        .replace(/[\s_\-()]/g, '')
        .trim();
    
    console.log('Comparing:', normalizedCurrent, 'vs', normalizedTarget);
    
    // Check by article name
    if (normalizedCurrent === normalizedTarget) {
        console.log('🎉 TARGET REACHED BY NAME! 🎉');
        finishGame();
        return;
    }
    
    // Additional check: verify by description text on page
    checkTargetByDescription();
}

// Finish game
function finishGame() {
    if (!gameState.gameActive) return; // Prevent multiple calls
    
    gameState.gameActive = false;
    const elapsed = Math.floor((Date.now() - gameState.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    if (gameState.ws && gameState.roomCode) {
        gameState.ws.send(JSON.stringify({
            type: 'player_finished',
            playerName: gameState.playerName,
            clicks: 0,
            time: timeStr,
            targetArticle: gameState.targetArticle
        }));
    }
    
    showResults(0, timeStr, gameState.targetArticle);
}

// Show results
function showResults(clicks, time, target) {
    showScreen('results');
    document.getElementById('resultTarget').textContent = target;
    
    // Load target page in iframe
    const resultFrame = document.getElementById('resultPageFrame');
    resultFrame.src = `https://ru.wikipedia.org/wiki/${encodeURIComponent(target)}`;
    document.getElementById('targetPageContainer').classList.remove('hidden');
    
    // Add to leaderboard (only for single player)
    if (!gameState.roomCode) {
        addToLeaderboard(gameState.playerName, time);
    }
    
    // Show winner info if in multiplayer
    if (gameState.roomCode) {
        document.getElementById('winnerInfo').classList.remove('hidden');
        document.getElementById('winnerName').textContent = gameState.playerName;
        document.getElementById('winnerTime').textContent = time;
        document.getElementById('multiplayerResults').classList.remove('hidden');
    } else {
        document.getElementById('winnerInfo').classList.add('hidden');
        document.getElementById('multiplayerResults').classList.add('hidden');
    }
    
    // Setup buttons correctly
    setupMultiplayerResults();
}

// Show multiplayer results (for all players when someone wins)
function showMultiplayerResults(winnerName, time, target) {
    console.log('showMultiplayerResults called with:', { winnerName, time, target });
    
    showScreen('results');
    console.log('Screen changed to results');
    
    document.getElementById('resultTarget').textContent = target;
    
    // Load target page in iframe
    const resultFrame = document.getElementById('resultPageFrame');
    resultFrame.src = `https://ru.wikipedia.org/wiki/${encodeURIComponent(target)}`;
    document.getElementById('targetPageContainer').classList.remove('hidden');
    
    // Show winner info
    document.getElementById('winnerInfo').classList.remove('hidden');
    document.getElementById('winnerName').textContent = winnerName;
    document.getElementById('winnerTime').textContent = time;
    document.getElementById('multiplayerResults').classList.remove('hidden');
    
    // Setup ready system
    setupMultiplayerResults();
    
    console.log('✓ Multiplayer results displayed');
}

// Add player result
function addPlayerResult(playerName, clicks, time) {
    const table = document.getElementById('resultsTable');
    const row = document.createElement('div');
    row.className = 'result-row';
    row.innerHTML = `<span><strong>${playerName}</strong></span><span>${time}</span>`;
    table.appendChild(row);
}

// Leave room
function leaveRoom() {
    gameState.roomCode = null;
    gameState.isHost = false;
    if (gameState.ws) gameState.ws.close();
    showScreen('lobby');
}

// Play again
async function playAgain() {
    gameState.currentArticle = 'Главная страница Wikipedia';
    gameState.gameActive = false;
    
    if (gameState.roomCode && gameState.isHost) {
        // In multiplayer, host starts new game
        console.log('🔄 Starting new game in room:', gameState.roomCode);
        await startGameHost();
    } else if (gameState.roomCode) {
        // Non-host - should use ready button instead
        return;
    } else {
        // Single player - start new game
        showScreen('countdown');
        document.getElementById('countdownNumber').textContent = 'Загрузка...';
        
        try {
            gameState.targetArticle = await getTargetArticle();
            console.log('✓ New target article loaded:', gameState.targetArticle);
        } catch (e) {
            console.error('✗ Error loading article:', e);
            gameState.targetArticle = 'Альберт Эйнштейн';
        }
        
        startCountdown();
    }
}

// Send ready status
function sendReady() {
    if (gameState.ws && gameState.roomCode) {
        gameState.ws.send(JSON.stringify({
            type: 'player_ready',
            playerName: gameState.playerName
        }));
        
        // Update button
        const btnReady = document.getElementById('btnReady');
        btnReady.innerHTML = '<span class="btn-icon">✓</span><span class="btn-label">Готов!</span>';
        btnReady.disabled = true;
        btnReady.style.opacity = '0.7';
    }
}

// Update ready status display
function updateReadyStatus(players) {
    const list = document.getElementById('readyPlayersList');
    if (list) {
        list.innerHTML = players.map((p, index) => {
            const isHost = index === 0;
            const color = p.color || '#666';
            const avatarUrl = p.avatarUrl || '';
            const borderStyle = p.borderStyle || 'none';
            
            let avatarStyle = `background: ${color};`;
            let avatarClass = 'player-avatar-small';
            let avatarContent = p.name.charAt(0).toUpperCase();
            
            // If has avatar URL, use it
            if (avatarUrl) {
                avatarStyle = `background-image: url(${avatarUrl}); background-size: cover; background-position: center;`;
                avatarClass += ' has-image';
                avatarContent = '';
            }
            
            if (borderStyle === 'glow') {
                avatarStyle += ` box-shadow: 0 0 8px ${color}, 0 0 15px ${color};`;
            } else if (borderStyle === 'pulse') {
                avatarClass += ' avatar-style-pulse';
            } else if (borderStyle === 'rainbow') {
                avatarClass += ' avatar-style-rainbow';
            }
            
            // Ready indicator - host is always ready, others show status
            const readyIndicator = isHost 
                ? '' 
                : `<div class="ready-status ${p.ready ? 'ready' : 'waiting'}">${p.ready ? '✓' : '⏳'}</div>`;
            
            return `
                <div class="ready-player-item ${p.ready ? 'player-ready' : ''}">
                    <div class="ready-player-info">
                        <div class="${avatarClass}" style="${avatarStyle}">${avatarContent}</div>
                        <span>${isHost ? '👑 ' : ''}${p.name}</span>
                    </div>
                    ${readyIndicator}
                </div>
            `;
        }).join('');
    }
}

// Enable start button when all ready
function enableStartButton() {
    const btn = document.getElementById('btnPlayAgain');
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">🚀</span><span class="btn-label">Начать игру!</span>';
}

// Setup results screen for multiplayer
function setupMultiplayerResults() {
    const btnPlayAgain = document.getElementById('btnPlayAgain');
    const btnReady = document.getElementById('btnReady');
    
    if (gameState.roomCode) {
        if (gameState.isHost) {
            // Host sees "Play again" but disabled until all ready
            btnPlayAgain.classList.remove('hidden');
            btnPlayAgain.disabled = true;
            btnPlayAgain.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-label">Ожидание игроков...</span>';
            btnReady.classList.add('hidden');
            
            // Host is ready by default - send ready status
            sendReady();
        } else {
            // Non-host sees "Ready" button
            btnPlayAgain.classList.add('hidden');
            btnReady.classList.remove('hidden');
            btnReady.disabled = false;
            btnReady.innerHTML = '<span class="btn-icon">✓</span><span class="btn-label">Готов</span>';
        }
        
        // Initialize ready list - host is ready by default
        if (gameState.players) {
            updateReadyStatus(gameState.players.map(p => ({ 
                ...p, 
                ready: p.name === gameState.playerName && gameState.isHost 
            })));
        }
    } else {
        // Single player
        btnPlayAgain.classList.remove('hidden');
        btnPlayAgain.disabled = false;
        btnPlayAgain.innerHTML = '<span class="btn-icon">🔄</span><span class="btn-label">Играть снова</span>';
        btnReady.classList.add('hidden');
    }
}

// Back to lobby
function backToLobby() {
    gameState.clickCount = 0;
    gameState.currentArticle = 'Главная страница Wikipedia';
    gameState.gameActive = false;
    
    // If in multiplayer - notify server and keep connection
    if (gameState.roomCode && gameState.ws) {
        gameState.ws.send(JSON.stringify({
            type: 'player_to_lobby',
            playerName: gameState.playerName
        }));
        
        // Show room panel again
        showScreen('lobby');
        showRoomPanel(gameState.roomCode, gameState.players, gameState.isHost);
    } else {
        // Single player - just go to lobby
        showScreen('lobby');
    }
}



// Show notification that host went to lobby
function showHostLobbyNotification(countdown) {
    if (gameState.isHost) return; // Host doesn't need notification
    
    // Create notification element if not exists
    let notification = document.getElementById('hostLobbyNotification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'hostLobbyNotification';
        notification.className = 'host-lobby-notification';
        document.body.appendChild(notification);
    }
    
    notification.innerHTML = `
        <div class="notification-content">
            <span>👑 Хост вернулся в меню</span>
            <span>Возврат через <strong id="lobbyCountdown">${countdown}</strong> сек...</span>
        </div>
    `;
    notification.classList.add('show');
    
    // Countdown
    let count = countdown;
    const interval = setInterval(() => {
        count--;
        const countdownEl = document.getElementById('lobbyCountdown');
        if (countdownEl) {
            countdownEl.textContent = count;
        }
        if (count <= 0) {
            clearInterval(interval);
        }
    }, 1000);
}

// Return to lobby with room preserved
function returnToLobbyWithRoom(code, players) {
    gameState.gameActive = false;
    gameState.roomCode = code;
    gameState.players = players;
    
    // Hide notification
    const notification = document.getElementById('hostLobbyNotification');
    if (notification) {
        notification.classList.remove('show');
    }
    
    // Show lobby with room panel
    showScreen('lobby');
    showRoomPanel(code, players, gameState.isHost);
}

// Toggle hint visibility
function toggleHint() {
    const box = document.getElementById('targetDescriptionBox');
    const btn = document.getElementById('btnToggleHint');
    if (box) box.classList.toggle('collapsed');
    if (btn) btn.textContent = box?.classList.contains('collapsed') ? '+' : '−';
}

// Found target button handler
function onFoundTarget() {
    if (!gameState.gameActive) return;
    
    const confirmed = confirm(`Вы уверены, что нашли статью "${gameState.targetArticle}"?`);
    if (confirmed) {
        console.log('✓ Player confirmed finding target');
        finishGame();
    }
}

// Update avatar with first letter of nickname
function updateAvatar() {
    const name = gameState.playerName || 'Игрок';
    const avatar = document.getElementById('userAvatar');
    const avatarPreviewLarge = document.getElementById('avatarPreviewLarge');
    
    if (avatar) {
        avatar.textContent = name.charAt(0).toUpperCase();
    }
    if (avatarPreviewLarge) {
        avatarPreviewLarge.textContent = name.charAt(0).toUpperCase();
    }
    
    updateUserDisplay();
}

// Color Picker Functions
let userColor = localStorage.getItem('userColor') || '#b45328';

function initColorWheel() {
    const canvas = document.getElementById('colorWheel');
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = canvas.width / 2;
    
    // Draw color wheel
    for (let angle = 0; angle < 360; angle++) {
        const startAngle = (angle - 1) * Math.PI / 180;
        const endAngle = (angle + 1) * Math.PI / 180;
        
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.closePath();
        
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, 'white');
        gradient.addColorStop(0.5, `hsl(${angle}, 100%, 50%)`);
        gradient.addColorStop(1, `hsl(${angle}, 100%, 25%)`);
        
        ctx.fillStyle = gradient;
        ctx.fill();
    }
    
    // Add click handler
    canvas.onclick = function(e) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const imageData = ctx.getImageData(x, y, 1, 1).data;
        const color = `rgb(${imageData[0]}, ${imageData[1]}, ${imageData[2]})`;
        
        setUserColor(color);
        
        // Show indicator
        const indicator = document.getElementById('colorIndicator');
        indicator.style.left = x + 'px';
        indicator.style.top = y + 'px';
        indicator.style.background = color;
        indicator.style.display = 'block';
    };
}

function selectPresetColor(color) {
    setUserColor(color);
}

function setUserColor(color) {
    userColor = color;
    localStorage.setItem('userColor', color);
    
    // Update all avatars
    const avatar = document.getElementById('userAvatar');
    const avatarPreviewLarge = document.getElementById('avatarPreviewLarge');
    
    if (avatar) avatar.style.background = color;
    if (avatarPreviewLarge) avatarPreviewLarge.style.background = color;
    
    applyAvatarStyle(avatar);
    applyAvatarStyle(avatarPreviewLarge);
    
    // Broadcast to other players
    broadcastProfileUpdate();
}

// Border style functions
let userBorderStyle = localStorage.getItem('userBorderStyle') || 'none';

function selectBorderStyle(style) {
    userBorderStyle = style;
    localStorage.setItem('userBorderStyle', style);
    
    // Update active state
    document.querySelectorAll('.border-style-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.style === style);
    });
    
    // Apply to avatars
    const avatar = document.getElementById('userAvatar');
    const avatarPreviewLarge = document.getElementById('avatarPreviewLarge');
    applyAvatarStyle(avatar);
    applyAvatarStyle(avatarPreviewLarge);
    
    // Broadcast to other players
    broadcastProfileUpdate();
}

function applyAvatarStyle(element) {
    if (!element) return;
    
    // Remove all style classes
    element.classList.remove('avatar-style-glow', 'avatar-style-pulse', 'avatar-style-rainbow');
    element.style.boxShadow = '';
    
    const color = localStorage.getItem('userColor') || '#b45328';
    const style = localStorage.getItem('userBorderStyle') || 'none';
    
    switch (style) {
        case 'glow':
            element.style.boxShadow = `0 0 10px ${color}, 0 0 20px ${color}`;
            element.classList.add('avatar-style-glow');
            break;
        case 'pulse':
            element.classList.add('avatar-style-pulse');
            break;
        case 'rainbow':
            element.classList.add('avatar-style-rainbow');
            break;
    }
}

function loadUserColor() {
    const color = localStorage.getItem('userColor') || '#b45328';
    const style = localStorage.getItem('userBorderStyle') || 'none';
    const avatarUrl = localStorage.getItem('userAvatarUrl') || '';
    
    setUserColor(color);
    selectBorderStyle(style);
    
    // Load avatar URL
    if (avatarUrl) {
        document.getElementById('avatarUrlInput').value = avatarUrl;
        updateAvatarsWithImage(avatarUrl);
    }
}

// Get user customization data
function getUserCustomization() {
    return {
        color: localStorage.getItem('userColor') || '#b45328',
        borderStyle: localStorage.getItem('userBorderStyle') || 'none',
        avatarUrl: localStorage.getItem('userAvatarUrl') || ''
    };
}

// Apply avatar URL
function applyAvatarUrl() {
    const input = document.getElementById('avatarUrlInput');
    const url = input.value.trim();
    
    if (url) {
        localStorage.setItem('userAvatarUrl', url);
        updateAvatarsWithImage(url);
        broadcastProfileUpdate();
    }
}

// Clear avatar URL
function clearAvatarUrl() {
    localStorage.removeItem('userAvatarUrl');
    document.getElementById('avatarUrlInput').value = '';
    
    const avatars = [
        document.getElementById('userAvatar'),
        document.getElementById('previewAvatar')
    ];
    
    avatars.forEach(avatar => {
        if (avatar) {
            avatar.classList.remove('has-image');
            avatar.style.backgroundImage = '';
        }
    });
    
    broadcastProfileUpdate();
}

// Update avatars with image
function updateAvatarsWithImage(url) {
    const avatars = [
        document.getElementById('userAvatar'),
        document.getElementById('previewAvatar')
    ];
    
    avatars.forEach(avatar => {
        if (avatar) {
            avatar.classList.add('has-image');
            avatar.style.backgroundImage = `url(${url})`;
        }
    });
}

// Broadcast profile update to other players
function broadcastProfileUpdate() {
    if (gameState.ws && gameState.roomCode) {
        const customization = getUserCustomization();
        gameState.ws.send(JSON.stringify({
            type: 'profile_update',
            playerName: gameState.playerName,
            color: customization.color,
            borderStyle: customization.borderStyle,
            avatarUrl: customization.avatarUrl
        }));
    }
}

// Toggle Death 404 mode with animation
function toggleDeath404Mode(enabled) {
    gameState.death404Mode = enabled;
    
    const death404Card = document.getElementById('death404Card');
    const death404Btn = document.getElementById('death404Toggle');
    const roomDeath404Btn = document.getElementById('roomDeath404Toggle');
    const modifiersTrigger = document.getElementById('modifiersTrigger');
    const roomModifiersTrigger = document.getElementById('roomModifiersTrigger');
    
    if (enabled) {
        document.body.classList.add('death-mode');
        document.body.classList.add('death-mode-activating');
        
        showDeathModeFlash();
        
        document.body.classList.add('screen-shake');
        setTimeout(() => document.body.classList.remove('screen-shake'), 500);
        
        if (death404Card) death404Card.classList.add('active');
        if (death404Btn) {
            death404Btn.classList.add('active');
            death404Btn.textContent = 'ON';
        }
        if (roomDeath404Btn) {
            roomDeath404Btn.classList.add('active');
            roomDeath404Btn.textContent = 'ON';
        }
        if (modifiersTrigger) modifiersTrigger.style.display = 'flex';
        if (roomModifiersTrigger) roomModifiersTrigger.classList.add('show');
        
        setTimeout(() => document.body.classList.remove('death-mode-activating'), 800);
        
    } else {
        document.body.classList.add('death-mode-deactivating');
        
        setTimeout(() => {
            document.body.classList.remove('death-mode');
            document.body.classList.remove('death-mode-deactivating');
        }, 400);
        
        if (death404Card) death404Card.classList.remove('active');
        if (death404Btn) {
            death404Btn.classList.remove('active');
            death404Btn.textContent = 'OFF';
        }
        if (roomDeath404Btn) {
            roomDeath404Btn.classList.remove('active');
            roomDeath404Btn.textContent = 'OFF';
        }
        if (modifiersTrigger) modifiersTrigger.style.display = 'none';
        if (roomModifiersTrigger) roomModifiersTrigger.classList.remove('show');
        
        hideModifiersPanel();
        resetModifiers();
    }
    
    // Notify other players in room
    if (gameState.ws && gameState.roomCode && gameState.isHost) {
        gameState.ws.send(JSON.stringify({
            type: 'room_settings',
            death404Mode: enabled,
            modifiers: gameState.modifiers
        }));
    }
    
    console.log('Death 404 mode:', enabled ? 'ON' : 'OFF');
}

// Show death mode flash effect
function showDeathModeFlash() {
    let flash = document.getElementById('deathModeFlash');
    if (!flash) {
        flash = document.createElement('div');
        flash.id = 'deathModeFlash';
        flash.className = 'death-flash';
        flash.innerHTML = '<span class="flash-skull">💀</span><span class="flash-text">РЕЖИМ 404</span>';
        document.body.appendChild(flash);
    }
    
    flash.classList.add('show');
    setTimeout(() => flash.classList.remove('show'), 1500);
}

// Reset all modifiers
function resetModifiers() {
    gameState.modifiers = {
        randomStart: false,
        teleport: false,
        noBack: false,
        fog: false
    };
    document.querySelectorAll('.modifier-checkbox').forEach(cb => cb.checked = false);
    document.querySelectorAll('.modifier-item').forEach(item => item.classList.remove('active'));
    updateActiveModifiersTags();
}

// Toggle modifier
function toggleModifier(modifierName, enabled) {
    gameState.modifiers[modifierName] = enabled;
    
    const item = document.querySelector(`[data-modifier="${modifierName}"]`);
    if (item) {
        item.classList.toggle('active', enabled);
    }
    
    // Get time limit value if applicable
    if (modifierName === 'timeLimit') {
        const timeLimitInput = document.getElementById('timeLimitValue');
        if (timeLimitInput) {
            gameState.timeLimitSeconds = parseInt(timeLimitInput.value) || 120;
        }
    }
    
    updateActiveModifiersTags();
    
    // Notify other players
    if (gameState.ws && gameState.roomCode && gameState.isHost) {
        gameState.ws.send(JSON.stringify({
            type: 'room_settings',
            death404Mode: gameState.death404Mode,
            modifiers: gameState.modifiers,
            timeLimitSeconds: gameState.timeLimitSeconds
        }));
    }
}

// Update active modifiers tags display
function updateActiveModifiersTags() {
    const tagsContainer = document.getElementById('activeTags');
    const countEl = document.getElementById('modifiersCount');
    
    const modifierNames = {
        randomStart: '🎲 Случайный старт',
        teleport: '🌀 Телепорт',
        timeLimit: `⏱️ ${gameState.timeLimitSeconds}с`,
        hiddenTarget: '🙈 Без заголовка',
        blindKitten: '🐱 Слепой котёнок',
        drunk: '🍺 Алкоголик'
    };
    
    const activeModsArray = Object.entries(gameState.modifiers).filter(([_, active]) => active);
    const activeCount = activeModsArray.length;
    
    // Update counter in trigger button
    if (countEl) {
        countEl.textContent = activeCount;
        countEl.style.display = activeCount > 0 ? 'inline' : 'none';
    }
    
    if (tagsContainer) {
        const activeMods = activeModsArray
            .map(([name, _]) => `<span class="modifier-tag">${modifierNames[name]}</span>`)
            .join('');
        
        tagsContainer.innerHTML = activeMods;
        
        const activeModifiers = document.getElementById('activeModifiers');
        if (activeModifiers) {
            activeModifiers.style.display = activeMods ? 'block' : 'none';
        }
    }
}

// Apply room settings from host
function applyRoomSettings(settings) {
    if (settings.death404Mode !== undefined) {
        gameState.death404Mode = settings.death404Mode;
        
        const roomPanel = document.getElementById('roomPanel');
        const death404Card = document.getElementById('death404Card');
        const death404Btn = document.getElementById('death404Toggle');
        const btnText = death404Btn?.querySelector('.death404-btn-text');
        const modifiersTrigger = document.getElementById('modifiersTrigger');
        
        if (settings.death404Mode) {
            document.body.classList.add('death-mode');
            roomPanel?.classList.add('death-mode-active');
            death404Card?.classList.add('active');
            death404Btn?.classList.add('active');
            if (btnText) btnText.textContent = 'ON';
            // Show modifiers trigger with animation
            if (modifiersTrigger) {
                modifiersTrigger.classList.add('show');
            }
        } else {
            document.body.classList.remove('death-mode');
            roomPanel?.classList.remove('death-mode-active');
            death404Card?.classList.remove('active');
            death404Btn?.classList.remove('active');
            if (btnText) btnText.textContent = 'OFF';
            // Hide modifiers trigger with animation
            if (modifiersTrigger) {
                modifiersTrigger.classList.remove('show');
            }
            hideModifiersPanel();
        }
    }
    
    // Apply time limit
    if (settings.timeLimitSeconds !== undefined) {
        gameState.timeLimitSeconds = settings.timeLimitSeconds;
        const timeLimitInput = document.getElementById('timeLimitValue');
        if (timeLimitInput) {
            timeLimitInput.value = settings.timeLimitSeconds;
        }
    }
    
    // Apply modifiers
    if (settings.modifiers) {
        gameState.modifiers = { ...settings.modifiers };
        
        // Update checkboxes
        Object.entries(settings.modifiers).forEach(([name, enabled]) => {
            const checkbox = document.getElementById(`mod${name.charAt(0).toUpperCase() + name.slice(1)}`);
            if (checkbox) checkbox.checked = enabled;
            
            const item = document.querySelector(`[data-modifier="${name}"]`);
            if (item) item.classList.toggle('active', enabled);
        });
        
        updateActiveModifiersTags();
    }
}

// Copy room code to clipboard
function copyRoomCode() {
    const code = document.getElementById('roomCode').textContent;
    navigator.clipboard.writeText(code).then(() => {
        const notification = document.getElementById('copyNotification');
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
        }, 2000);
    });
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM loaded, initializing...');
    
    try {
        // Load saved nickname
        loadNickname();
        
        // Load user color
        loadUserColor();
        
        // Update avatar on load
        updateAvatar();
        
        // Display leaderboard
        displayLeaderboard();
    } catch (e) {
        console.error('Init error:', e);
    }
    
    // Close color picker when clicking outside
    document.addEventListener('click', (e) => {
        const popup = document.getElementById('colorPickerPopup');
        const avatar = document.getElementById('userAvatar');
        if (popup && popup.classList.contains('show')) {
            if (!popup.contains(e.target) && e.target !== avatar) {
                popup.classList.remove('show');
            }
        }
    });
    
    // Player name input
    const playerNameInput = document.getElementById('playerName');
    if (playerNameInput) {
        playerNameInput.addEventListener('input', () => {
            updateAvatar();
            saveNickname(playerNameInput.value);
        });
    }
    
    // Lobby buttons
    const btnSinglePlayer = document.getElementById('btnSinglePlayer');
    const btnCreateRoom = document.getElementById('btnCreateRoom');
    const btnJoinRoom = document.getElementById('btnJoinRoom');
    const btnJoinConfirm = document.getElementById('btnJoinConfirm');
    
    console.log('Buttons found:', { btnSinglePlayer: !!btnSinglePlayer, btnCreateRoom: !!btnCreateRoom, btnJoinRoom: !!btnJoinRoom });
    
    if (btnSinglePlayer) btnSinglePlayer.addEventListener('click', () => { console.log('Single player clicked'); startSinglePlayer(); });
    if (btnCreateRoom) btnCreateRoom.addEventListener('click', () => { console.log('Create room clicked'); createRoom(); });
    if (btnJoinRoom) btnJoinRoom.addEventListener('click', () => { console.log('Join room clicked'); slideToJoin(); });
    if (btnJoinConfirm) btnJoinConfirm.addEventListener('click', () => { console.log('Join confirm clicked'); joinRoomConfirm(); });
    
    // Back buttons for slides
    const btnBackToMenu = document.getElementById('btnBackToMenu');
    const btnBackFromJoin = document.getElementById('btnBackFromJoin');
    
    if (btnBackToMenu) btnBackToMenu.addEventListener('click', () => {
        leaveRoom();
        hideRoomPanel();
    });
    if (btnBackFromJoin) btnBackFromJoin.addEventListener('click', slideToMenu);
    
    // Room panel buttons
    const btnStartGamePanel = document.getElementById('btnStartGamePanel');
    const btnReadyLobby = document.getElementById('btnReadyLobby');
    
    if (btnStartGamePanel) btnStartGamePanel.addEventListener('click', startGameHost);
    if (btnReadyLobby) btnReadyLobby.addEventListener('click', sendReadyLobby);
    
    const roomCodeDisplay = document.getElementById('roomCodeDisplay');
    if (roomCodeDisplay) roomCodeDisplay.addEventListener('click', copyRoomCodePanel);
    
    // Death 404 mode toggle (button style) - main menu
    const death404Toggle = document.getElementById('death404Toggle');
    if (death404Toggle) {
        death404Toggle.addEventListener('click', () => {
            if (death404Toggle.disabled) return;
            const newState = !gameState.death404Mode;
            toggleDeath404Mode(newState);
        });
    }
    
    // Death 404 mode toggle - room settings
    const roomDeath404Toggle = document.getElementById('roomDeath404Toggle');
    if (roomDeath404Toggle) {
        roomDeath404Toggle.addEventListener('click', () => {
            if (!gameState.isHost) return;
            const newState = !gameState.death404Mode;
            toggleDeath404Mode(newState);
            // Update room toggle button
            roomDeath404Toggle.textContent = newState ? 'ON' : 'OFF';
            roomDeath404Toggle.classList.toggle('active', newState);
            // Show/hide modifiers button
            const modBtn = document.getElementById('roomModifiersTrigger');
            if (modBtn) modBtn.classList.toggle('show', newState);
        });
    }
    
    // Room modifiers trigger
    const roomModifiersTrigger = document.getElementById('roomModifiersTrigger');
    if (roomModifiersTrigger) {
        roomModifiersTrigger.addEventListener('click', showModifiersPanel);
    }
    
    // Max players selector
    const playersCountBtn = document.getElementById('playersCountBtn');
    if (playersCountBtn) {
        playersCountBtn.addEventListener('click', showMaxPlayersPopup);
    }
    
    document.querySelectorAll('.wheel-option').forEach(opt => {
        opt.addEventListener('click', () => {
            selectMaxPlayers(parseInt(opt.dataset.value));
        });
    });
    
    const maxPlayersConfirm = document.getElementById('maxPlayersConfirm');
    if (maxPlayersConfirm) {
        maxPlayersConfirm.addEventListener('click', confirmMaxPlayers);
    }
    
    // Close max players popup on outside click
    const maxPlayersPopup = document.getElementById('maxPlayersPopup');
    if (maxPlayersPopup) {
        document.addEventListener('click', (e) => {
            if (maxPlayersPopup.classList.contains('show') && 
                !maxPlayersPopup.contains(e.target) && 
                e.target !== playersCountBtn &&
                !playersCountBtn?.contains(e.target)) {
                hideMaxPlayersPopup();
            }
        });
    }
    
    // Modifier items in modal - hover for details, click to toggle
    document.querySelectorAll('.mod-item').forEach(item => {
        item.addEventListener('mouseenter', () => {
            showModifierDetails(item.dataset.modifier);
        });
        item.addEventListener('click', (e) => {
            if (!e.target.classList.contains('toggle-btn')) {
                toggleModifierFromModal(item.dataset.modifier);
            }
        });
    });
    
    // Toggle buttons in modal
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleModifierFromModal(btn.dataset.modifier);
        });
    });
    
    // Time limit input
    const timeLimitInput = document.getElementById('timeLimitValue');
    if (timeLimitInput) {
        timeLimitInput.addEventListener('change', (e) => {
            gameState.timeLimitSeconds = parseInt(e.target.value) || 120;
            updateActiveModifiersTags();
            
            // Notify other players if host
            if (gameState.ws && gameState.roomCode && gameState.isHost) {
                gameState.ws.send(JSON.stringify({
                    type: 'room_settings',
                    death404Mode: gameState.death404Mode,
                    modifiers: gameState.modifiers,
                    timeLimitSeconds: gameState.timeLimitSeconds
                }));
            }
        });
        
        // Prevent click from toggling modifier description
        timeLimitInput.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    
    // Multiplayer lobby (old - keep for compatibility)
    const btnStartGame = document.getElementById('btnStartGame');
    const btnLeaveRoom = document.getElementById('btnLeaveRoom');
    if (btnStartGame) btnStartGame.addEventListener('click', startGameHost);
    if (btnLeaveRoom) btnLeaveRoom.addEventListener('click', leaveRoom);
    
    // Game - toggle hint
    const btnToggleHint = document.getElementById('btnToggleHint');
    if (btnToggleHint) btnToggleHint.addEventListener('click', toggleHint);
    
    // Game - found target button
    const btnFoundTarget = document.getElementById('btnFoundTarget');
    if (btnFoundTarget) btnFoundTarget.addEventListener('click', onFoundTarget);
    
    // Results
    const btnPlayAgain = document.getElementById('btnPlayAgain');
    const btnReady = document.getElementById('btnReady');
    const btnBackToLobby = document.getElementById('btnBackToLobby');
    
    if (btnPlayAgain) btnPlayAgain.addEventListener('click', playAgain);
    if (btnReady) btnReady.addEventListener('click', sendReady);
    if (btnBackToLobby) btnBackToLobby.addEventListener('click', backToLobby);
    
    // Connect WebSocket (with error handling)
    try {
        connectWebSocket();
    } catch (e) {
        console.error('WebSocket init error:', e);
    }
    
    console.log('✅ All event listeners attached');
    
    // Modifiers panel scroll indicator
    const modifiersPanel = document.getElementById('modifiersPanel');
    if (modifiersPanel) {
        let scrollTimeout;
        modifiersPanel.addEventListener('scroll', () => {
            modifiersPanel.classList.add('scrolling');
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                modifiersPanel.classList.remove('scrolling');
            }, 1000);
        });
    }
    
    // Modifiers trigger button - opens modifiers modal
    const modifiersTrigger = document.getElementById('modifiersTrigger');
    if (modifiersTrigger) {
        modifiersTrigger.addEventListener('click', () => {
            showModifiersPanel();
        });
    }
    
    // Modifiers modal close button
    const modifiersModalClose = document.getElementById('modifiersModalClose');
    if (modifiersModalClose) {
        modifiersModalClose.addEventListener('click', hideModifiersPanel);
    }
    
    // Modifiers modal confirm button
    const modifiersConfirm = document.getElementById('modifiersConfirm');
    if (modifiersConfirm) {
        modifiersConfirm.addEventListener('click', hideModifiersPanel);
    }
    
    // Modifiers modal - click overlay to close
    const modifiersModal = document.getElementById('modifiersModal');
    if (modifiersModal) {
        modifiersModal.addEventListener('click', (e) => {
            if (e.target === modifiersModal) {
                hideModifiersPanel();
            }
        });
    }
    
    // Modifier rows in modal - hover for details, click to toggle
    document.querySelectorAll('.modifier-row').forEach(row => {
        row.addEventListener('mouseenter', () => {
            showModifierDetails(row.dataset.modifier);
        });
        
        row.addEventListener('click', (e) => {
            if (!e.target.classList.contains('toggle-btn')) {
                toggleModifierFromModal(row.dataset.modifier);
            }
        });
    });
    
    // Toggle buttons in modal
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleModifierFromModal(btn.dataset.modifier);
        });
    });
    
    // Time limit input in modal
    const timeLimitValueModal = document.getElementById('timeLimitValueModal');
    if (timeLimitValueModal) {
        timeLimitValueModal.addEventListener('change', (e) => {
            gameState.timeLimitSeconds = parseInt(e.target.value) || 120;
            updateActiveModifiersTags();
            
            if (gameState.ws && gameState.roomCode && gameState.isHost) {
                gameState.ws.send(JSON.stringify({
                    type: 'room_settings',
                    death404Mode: gameState.death404Mode,
                    modifiers: gameState.modifiers,
                    timeLimitSeconds: gameState.timeLimitSeconds
                }));
            }
        });
    }
    
    // How to play button
    const btnHowToPlay = document.getElementById('btnHowToPlay');
    if (btnHowToPlay) {
        btnHowToPlay.addEventListener('click', showHowToPlayModal);
    }
    
    // How to play modal close
    const howToPlayModalClose = document.getElementById('howToPlayModalClose');
    if (howToPlayModalClose) {
        howToPlayModalClose.addEventListener('click', hideHowToPlayModal);
    }
    
    // How to play modal - click overlay to close
    const howToPlayModal = document.getElementById('howToPlayModal');
    if (howToPlayModal) {
        howToPlayModal.addEventListener('click', (e) => {
            if (e.target === howToPlayModal) {
                hideHowToPlayModal();
            }
        });
    }
    
    // Help topics navigation
    document.querySelectorAll('.help-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active state
            document.querySelectorAll('.help-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Show corresponding content
            const topicName = tab.dataset.topic;
            document.querySelectorAll('.help-page').forEach(page => {
                page.classList.toggle('hidden', page.dataset.topic !== topicName);
            });
        });
    });
    
    // Global keyboard handler
    document.addEventListener('keydown', handleGlobalKeyboard);
    
    // Initialize new modifiers UI
    initModifiersUI();
    
    // Initialize target search
    initTargetSearch();
});

// ========== NEW MODIFIERS UI ==========

// Initialize modifiers UI with new toggle switches
function initModifiersUI() {
    // New toggle switches
    document.querySelectorAll('.mod-toggle').forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const modName = toggle.dataset.modifier;
            toggleModifierNew(modName, toggle);
        });
    });
    
    // Mod items click
    document.querySelectorAll('.mod-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.mod-toggle')) return;
            const modName = item.dataset.modifier;
            const toggle = item.querySelector('.mod-toggle');
            toggleModifierNew(modName, toggle);
        });
    });
}

// Toggle modifier with animation
function toggleModifierNew(modName, toggleBtn) {
    const newState = !gameState.modifiers[modName];
    gameState.modifiers[modName] = newState;
    
    const item = document.querySelector(`.mod-item[data-modifier="${modName}"]`);
    
    // Toggle button state
    if (toggleBtn) {
        toggleBtn.classList.toggle('active', newState);
    }
    
    // Item state
    if (item) {
        item.classList.toggle('active', newState);
        
        // Activation animation
        if (newState) {
            item.classList.add('activating');
            setTimeout(() => item.classList.remove('activating'), 400);
            
            // Flash effect
            showHardcoreFlash();
        }
    }
    
    // Update count
    updateModifiersCount();
    
    // Sync with old UI
    updateModifiersModalState();
    updateActiveModifiersTags();
    
    // Notify server
    if (gameState.ws && gameState.roomCode && gameState.isHost) {
        gameState.ws.send(JSON.stringify({
            type: 'room_settings',
            death404Mode: gameState.death404Mode,
            modifiers: gameState.modifiers,
            timeLimitSeconds: gameState.timeLimitSeconds
        }));
    }
}

// Show hardcore flash animation
function showHardcoreFlash() {
    const flash = document.createElement('div');
    flash.className = 'hardcore-flash';
    document.body.appendChild(flash);
    
    setTimeout(() => flash.remove(), 600);
}

// Update modifiers count display
function updateModifiersCount() {
    const count = Object.values(gameState.modifiers).filter(v => v).length;
    
    const countEl = document.getElementById('activeModifiersCount');
    if (countEl) {
        countEl.textContent = count;
        
        // Animate count change
        countEl.style.transform = 'scale(1.3)';
        setTimeout(() => countEl.style.transform = 'scale(1)', 200);
    }
    
    // Update trigger counts
    const triggerCount = document.getElementById('modifiersCount');
    if (triggerCount) {
        triggerCount.textContent = count;
        triggerCount.style.display = count > 0 ? 'inline' : 'none';
    }
    
    const roomCount = document.getElementById('roomModifiersCount');
    if (roomCount) {
        roomCount.textContent = count;
        roomCount.style.display = count > 0 ? 'inline' : 'none';
    }
}

// ========== TARGET SEARCH ==========

let searchTimeout = null;
let customTargetArticle = null;

// Initialize target search functionality
function initTargetSearch() {
    const input = document.getElementById('targetSearchInput');
    const suggestions = document.getElementById('targetSuggestions');
    const clearBtn = document.getElementById('targetClearBtn');
    const randomBtn = document.getElementById('targetRandomBtn');
    
    if (!input) return;
    
    // Search input handler
    input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        
        if (searchTimeout) clearTimeout(searchTimeout);
        
        if (query.length < 2) {
            hideSuggestions();
            return;
        }
        
        // Debounce search
        searchTimeout = setTimeout(() => {
            searchWikipediaArticles(query);
        }, 300);
    });
    
    // Focus/blur handlers
    input.addEventListener('focus', () => {
        if (input.value.trim().length >= 2) {
            suggestions.classList.add('show');
        }
    });
    
    // Click outside to close
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.target-search-wrap')) {
            hideSuggestions();
        }
    });
    
    // Clear button
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            clearTargetSelection();
        });
    }
    
    // Random button
    if (randomBtn) {
        randomBtn.addEventListener('click', () => {
            clearTargetSelection();
        });
    }
}

// Search Wikipedia articles
async function searchWikipediaArticles(query) {
    const suggestions = document.getElementById('targetSuggestions');
    if (!suggestions) return;
    
    // Show loading
    suggestions.innerHTML = '<div class="suggestion-loading">🔍 Поиск...</div>';
    suggestions.classList.add('show');
    
    try {
        const url = `https://ru.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=8&namespace=0&format=json&origin=*`;
        const response = await fetch(url);
        const data = await response.json();
        
        const titles = data[1] || [];
        
        if (titles.length === 0) {
            suggestions.innerHTML = '<div class="suggestion-loading">Ничего не найдено</div>';
            return;
        }
        
        suggestions.innerHTML = titles.map(title => `
            <div class="suggestion-item" data-title="${title}">
                <span class="suggestion-icon">📄</span>
                <span class="suggestion-text">${title}</span>
            </div>
        `).join('');
        
        // Add click handlers
        suggestions.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                selectTargetArticle(item.dataset.title);
            });
        });
        
    } catch (e) {
        console.error('Search error:', e);
        suggestions.innerHTML = '<div class="suggestion-loading">Ошибка поиска</div>';
    }
}

// Select target article
function selectTargetArticle(title) {
    customTargetArticle = title;
    
    const input = document.getElementById('targetSearchInput');
    const selectedValue = document.getElementById('targetSelectedValue');
    
    if (input) input.value = '';
    if (selectedValue) {
        selectedValue.textContent = `📄 ${title}`;
        selectedValue.classList.add('has-target');
    }
    
    hideSuggestions();
    
    console.log('✓ Custom target selected:', title);
}

// Clear target selection
function clearTargetSelection() {
    customTargetArticle = null;
    
    const input = document.getElementById('targetSearchInput');
    const selectedValue = document.getElementById('targetSelectedValue');
    
    if (input) input.value = '';
    if (selectedValue) {
        selectedValue.textContent = '🎲 Случайная статья';
        selectedValue.classList.remove('has-target');
    }
    
    console.log('✓ Target reset to random');
}

// Hide suggestions dropdown
function hideSuggestions() {
    const suggestions = document.getElementById('targetSuggestions');
    if (suggestions) {
        suggestions.classList.remove('show');
    }
}

// Get target article (custom or random)
async function getTargetArticle() {
    if (customTargetArticle) {
        console.log('Using custom target:', customTargetArticle);
        return customTargetArticle;
    }
    return await getRandomArticle();
}
