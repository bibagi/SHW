const express = require('express');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));
app.use(express.json());

// Health check endpoint для Render
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Self-ping каждые 30 секунд чтобы не засыпал на Render
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
    setInterval(() => {
        https.get(`${RENDER_URL}/health`, (res) => {
            console.log('🏓 Self-ping:', res.statusCode);
        }).on('error', (err) => {
            console.log('Self-ping error:', err.message);
        });
    }, 30000);
}

// Хранилище комнат
const rooms = new Map();

// Генерация кода комнаты
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// WebSocket обработка
wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => ws.isAlive = true);

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handleMessage(ws, message);
        } catch (e) {
            console.error('Error parsing message:', e);
        }
    });

    ws.on('close', () => {
        handleDisconnect(ws);
    });
});

// Пинг для проверки соединения
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);


function handleMessage(ws, message) {
    switch (message.type) {
        case 'create_room':
            createRoom(ws, message);
            break;
        case 'join_room':
            joinRoom(ws, message);
            break;
        case 'start_game':
            startGame(ws, message);
            break;
        case 'player_finished':
            playerFinished(ws, message);
            break;
        case 'player_progress':
            updateProgress(ws, message);
            break;
        case 'player_ready':
            playerReady(ws, message);
            break;
        case 'player_to_lobby':
            playerToLobby(ws, message);
            break;
        case 'room_settings':
            updateRoomSettings(ws, message);
            break;
        case 'lobby_ready':
            lobbyReady(ws, message);
            break;
        case 'profile_update':
            profileUpdate(ws, message);
            break;
    }
}

function createRoom(ws, message) {
    const code = generateRoomCode();
    const room = {
        code,
        host: ws,
        players: [{
            ws,
            name: message.playerName,
            id: Date.now(),
            color: message.color || '#b45328',
            borderStyle: message.borderStyle || 'none',
            avatarUrl: message.avatarUrl || '',
            score: 0,
            wins: 0,
            gamesPlayed: 0
        }],
        gameStarted: false,
        startArticle: null,
        targetArticle: null,
        leaderboard: []
    };
    rooms.set(code, room);
    ws.roomCode = code;
    ws.playerName = message.playerName;

    const response = {
        type: 'room_created',
        code,
        players: room.players.map(p => ({
            name: p.name,
            id: p.id,
            color: p.color,
            borderStyle: p.borderStyle,
            avatarUrl: p.avatarUrl || ''
        }))
    };
    console.log('📤 room_created:', JSON.stringify(response));
    ws.send(JSON.stringify(response));
}

function joinRoom(ws, message) {
    const room = rooms.get(message.code);
    if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Комната не найдена' }));
        return;
    }
    if (room.gameStarted) {
        ws.send(JSON.stringify({ type: 'error', message: 'Игра уже началась' }));
        return;
    }
    if (room.players.length >= 8) {
        ws.send(JSON.stringify({ type: 'error', message: 'Комната заполнена' }));
        return;
    }

    // Check if player already in room
    const existingPlayer = room.players.find(p => p.name === message.playerName);
    if (existingPlayer) {
        ws.send(JSON.stringify({ type: 'error', message: 'Игрок с таким именем уже в комнате' }));
        return;
    }

    const player = {
        ws,
        name: message.playerName,
        id: Date.now(),
        color: message.color || '#b45328',
        borderStyle: message.borderStyle || 'none',
        avatarUrl: message.avatarUrl || '',
        score: 0,
        wins: 0,
        gamesPlayed: 0
    };
    room.players.push(player);
    ws.roomCode = message.code;
    ws.playerName = message.playerName;

    const playerList = room.players.map(p => ({
        name: p.name,
        id: p.id,
        color: p.color,
        borderStyle: p.borderStyle,
        avatarUrl: p.avatarUrl || '',
        score: p.score || 0,
        wins: p.wins || 0
    }));

    // Send room_joined to the new player
    const joinMsg = JSON.stringify({
        type: 'room_joined',
        code: message.code,
        players: playerList
    });
    console.log('📤 Sending room_joined to', message.playerName, ':', joinMsg);
    ws.send(joinMsg);

    // Send current room settings to new player
    if (room.death404Mode || room.modifiers || room.timeLimitSeconds || room.maxPlayers) {
        ws.send(JSON.stringify({
            type: 'room_settings',
            death404Mode: room.death404Mode || false,
            modifiers: room.modifiers || {},
            timeLimitSeconds: room.timeLimitSeconds || 120,
            maxPlayers: room.maxPlayers || 8
        }));
    }

    // Send player_joined to other players
    room.players.forEach(p => {
        if (p.ws !== ws) {
            p.ws.send(JSON.stringify({ type: 'player_joined', players: playerList }));
        }
    });

    console.log('✓ Player', message.playerName, 'joined room', message.code);
}

function startGame(ws, message) {
    const room = rooms.get(ws.roomCode);
    if (!room || room.host !== ws) return;

    room.gameStarted = true;
    room.gameFinished = false;

    // Reset ready status for all players
    room.players.forEach(p => {
        p.ready = false;
    });
    room.startArticle = message.startArticle;
    room.targetArticle = message.targetArticle;

    room.players.forEach(p => {
        p.ws.send(JSON.stringify({
            type: 'game_started',
            startArticle: room.startArticle,
            targetArticle: room.targetArticle,
            death404Mode: room.death404Mode || false,
            modifiers: room.modifiers || {},
            timeLimitSeconds: room.timeLimitSeconds || 120
        }));
    });
}

function playerFinished(ws, message) {
    console.log('playerFinished called. ws.roomCode:', ws.roomCode);

    const room = rooms.get(ws.roomCode);
    if (!room) {
        console.log('❌ Room not found for player finish. Available rooms:', Array.from(rooms.keys()));
        return;
    }

    // Mark game as finished
    room.gameFinished = true;
    room.winner = {
        name: ws.playerName,
        time: message.time,
        targetArticle: message.targetArticle
    };

    // Update scores
    const winner = room.players.find(p => p.name === ws.playerName);
    if (winner) {
        winner.wins = (winner.wins || 0) + 1;
        winner.score = (winner.score || 0) + 100; // 100 points for win
        winner.gamesPlayed = (winner.gamesPlayed || 0) + 1;
    }

    // Give participation points to others
    room.players.forEach(p => {
        if (p.name !== ws.playerName) {
            p.gamesPlayed = (p.gamesPlayed || 0) + 1;
            p.score = (p.score || 0) + 10; // 10 points for participation
        }
    });

    // Build leaderboard
    const leaderboard = room.players
        .map(p => ({
            name: p.name,
            score: p.score || 0,
            wins: p.wins || 0,
            color: p.color
        }))
        .sort((a, b) => b.score - a.score);

    console.log('✓ Game finished! Winner:', room.winner.name, 'Room:', ws.roomCode);
    console.log('Leaderboard:', leaderboard);

    // Send to all players in the room
    const gameFinishedMsg = JSON.stringify({
        type: 'game_finished',
        winner: room.winner.name,
        time: room.winner.time,
        targetArticle: room.winner.targetArticle,
        leaderboard: leaderboard
    });

    room.players.forEach(p => {
        try {
            if (p.ws && p.ws.readyState === 1) { // 1 = OPEN
                p.ws.send(gameFinishedMsg);
                console.log('✓ Sent game_finished to:', p.name);
            } else {
                console.log('❌ Cannot send to', p.name, '- WS state:', p.ws.readyState);
            }
        } catch (e) {
            console.error('Error sending to', p.name, ':', e.message);
        }
    });
}

function updateProgress(ws, message) {
    const room = rooms.get(ws.roomCode);
    if (!room) return;

    room.players.forEach(p => {
        if (p.ws !== ws) {
            p.ws.send(JSON.stringify({
                type: 'player_progress',
                playerName: ws.playerName,
                currentArticle: message.currentArticle,
                clicks: message.clicks
            }));
        }
    });
}

function profileUpdate(ws, message) {
    const room = rooms.get(ws.roomCode);
    if (!room) return;

    // Find player and update their profile
    const player = room.players.find(p => p.ws === ws);
    if (player) {
        if (message.color) player.color = message.color;
        if (message.borderStyle) player.borderStyle = message.borderStyle;
        player.avatarUrl = message.avatarUrl || '';
    }

    // Prepare players list
    const playerList = room.players.map(p => ({
        name: p.name,
        id: p.id,
        color: p.color,
        borderStyle: p.borderStyle,
        avatarUrl: p.avatarUrl || '',
        ready: p.ready || false
    }));

    // Broadcast to all players in room
    room.players.forEach(p => {
        p.ws.send(JSON.stringify({
            type: 'players_update',
            players: playerList
        }));
    });

    console.log('✓ Profile updated for', ws.playerName);
}

function lobbyReady(ws, message) {
    const room = rooms.get(ws.roomCode);
    if (!room) return;

    // Find player and toggle ready status
    const player = room.players.find(p => p.ws === ws);
    if (player) {
        // If message has explicit ready state, use it; otherwise toggle
        player.ready = message.ready !== undefined ? message.ready : !player.ready;
    }

    // Prepare players list with ready status
    const playerList = room.players.map(p => ({
        name: p.name,
        id: p.id,
        color: p.color,
        borderStyle: p.borderStyle,
        ready: p.ready || false
    }));

    // Send updated player list to all players
    room.players.forEach(p => {
        p.ws.send(JSON.stringify({
            type: 'lobby_ready_update',
            players: playerList
        }));
    });

    console.log('✓ Player', ws.playerName, 'ready status:', player?.ready);
}

function updateRoomSettings(ws, message) {
    const room = rooms.get(ws.roomCode);
    if (!room || room.host !== ws) return; // Only host can change settings

    // Update room settings
    if (message.death404Mode !== undefined) {
        room.death404Mode = message.death404Mode;
    }
    if (message.modifiers !== undefined) {
        room.modifiers = message.modifiers;
    }
    if (message.timeLimitSeconds !== undefined) {
        room.timeLimitSeconds = message.timeLimitSeconds;
    }
    if (message.maxPlayers !== undefined) {
        room.maxPlayers = message.maxPlayers;
    }

    // Broadcast to all other players
    room.players.forEach(p => {
        if (p.ws !== ws) {
            p.ws.send(JSON.stringify({
                type: 'room_settings',
                death404Mode: room.death404Mode,
                modifiers: room.modifiers,
                timeLimitSeconds: room.timeLimitSeconds,
                maxPlayers: room.maxPlayers
            }));
        }
    });
}

function playerToLobby(ws, message) {
    const room = rooms.get(ws.roomCode);
    if (!room) return;

    const player = room.players.find(p => p.ws === ws);
    if (player) {
        player.inLobby = true;
    }

    // If host went to lobby - notify all players to return to lobby after 5 seconds
    if (room.host === ws) {
        room.players.forEach(p => {
            p.ws.send(JSON.stringify({
                type: 'host_to_lobby',
                countdown: 5
            }));
        });

        // After 5 seconds, reset room state
        setTimeout(() => {
            const currentRoom = rooms.get(ws.roomCode);
            if (currentRoom) {
                currentRoom.gameStarted = false;
                currentRoom.gameFinished = false;
                currentRoom.players.forEach(p => {
                    p.ready = false;
                    p.inLobby = true;
                });

                // Send all players back to lobby with room info
                const playerList = currentRoom.players.map(p => ({
                    name: p.name,
                    id: p.id,
                    color: p.color,
                    borderStyle: p.borderStyle
                }));

                currentRoom.players.forEach(p => {
                    p.ws.send(JSON.stringify({
                        type: 'return_to_lobby',
                        code: ws.roomCode,
                        players: playerList
                    }));
                });
            }
        }, 5000);
    }
}

function playerReady(ws, message) {
    const room = rooms.get(ws.roomCode);
    if (!room) return;

    // Find player and mark as ready
    const player = room.players.find(p => p.ws === ws);
    if (player) {
        player.ready = true;
    }

    // Prepare players list with ready status
    const playerList = room.players.map(p => ({
        name: p.name,
        id: p.id,
        color: p.color,
        borderStyle: p.borderStyle,
        ready: p.ready || false
    }));

    // Send updated ready status to all players
    room.players.forEach(p => {
        p.ws.send(JSON.stringify({
            type: 'player_ready',
            players: playerList
        }));
    });

    // Check if all players are ready
    const allReady = room.players.every(p => p.ready);
    if (allReady && room.players.length > 1) {
        // Notify host that all are ready
        room.host.send(JSON.stringify({
            type: 'all_ready'
        }));
    }
}

function handleDisconnect(ws) {
    if (!ws.roomCode) return;
    const room = rooms.get(ws.roomCode);
    if (!room) return;

    room.players = room.players.filter(p => p.ws !== ws);

    if (room.players.length === 0) {
        rooms.delete(ws.roomCode);
    } else {
        if (room.host === ws) {
            room.host = room.players[0].ws;
        }
        const playerList = room.players.map(p => ({ name: p.name, id: p.id }));
        room.players.forEach(p => {
            p.ws.send(JSON.stringify({ type: 'player_left', players: playerList }));
        });
    }
}

const PORT = process.env.PORT || 3000;

// Получение локального IP адреса
function getLocalIP() {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

server.listen(PORT, () => {
    const localIP = getLocalIP();
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║       🎮 Шесть Рукопожатий Википедии - Сервер запущен!     ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  📍 Локально:     http://localhost:${PORT}                    ║`);
    console.log(`║  🌐 Для других:   http://${localIP}:${PORT}                 ║`);
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  Поделитесь IP адресом с друзьями для совместной игры!     ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
});
