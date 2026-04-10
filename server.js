const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, '/')));

// --- GAME CONFIG ---
const TICK_RATE = 30;
const ROUND_LIMIT = 5; // Win 5 rounds to win the game

let gameState = {
    players: {},
    score: { T: 0, CT: 0 },
    currentRound: 1,
    roundActive: false,
    teamAssignment: {} // userId -> 'T' or 'CT'
};

function resetRound() {
    console.log(`Starting Round ${gameState.currentRound}`);
    gameState.roundActive = true;
    
    // Reset player positions and health
    for (let id in gameState.players) {
        const player = gameState.players[id];
        const team = gameState.teamAssignment[id];
        
        player.health = 100;
        player.alive = true;
        
        // Simple spawn points based on team
        player.x = team === 'T' ? 10 : 90;
        player.z = Math.random() * 20;
    }
    io.emit('roundStart', { round: gameState.currentRound, score: gameState.score });
}

function checkRoundEnd() {
    if (!gameState.roundActive) return;

    let tAlive = 0;
    let ctAlive = 0;

    for (let id in gameState.players) {
        if (gameState.players[id].alive) {
            if (gameState.teamAssignment[id] === 'T') tAlive++;
            if (gameState.teamAssignment[id] === 'CT') ctAlive++;
        }
    }

    if (tAlive === 0 || ctAlive === 0) {
        gameState.roundActive = false;
        const winner = tAlive > 0 ? 'T' : 'CT';
        gameState.score[winner]++;
        
        console.log(`Round ${gameState.currentRound} won by ${winner}!`);
        io.emit('roundEnd', { winner, score: gameState.score });

        if (gameState.score[winner] >= ROUND_LIMIT) {
            io.emit('gameEnd', { winner, score: gameState.score });
            gameState.score = { T: 0, CT: 0 };
            gameState.currentRound = 1;
        } else {
            gameState.currentRound++;
            setTimeout(resetRound, 5000); // 5 seconds pause between rounds
        }
    }
}

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Assign Team
    const team = Math.random() > 0.5 ? 'T' : 'CT';
    gameState.teamAssignment[socket.id] = team;

    gameState.players[socket.id] = {
        x: 0, y: 0, z: 0,
        ry: 0,
        health: 100,
        alive: true,
        team: team
    };

    socket.emit('init', { id: socket.id, team: team });

    socket.on('move', (data) => {
        if (gameState.players[socket.id] && gameState.players[socket.id].alive) {
            gameState.players[socket.id].x = data.x;
            gameState.players[socket.id].z = data.z;
            gameState.players[socket.id].ry = data.ry;
        }
    });

    socket.on('shoot', (data) => {
        // Hit detection logic
        io.emit('playerShot', { shooter: socket.id, ...data });
    });

    socket.on('damage', ({ targetId, amount }) => {
        if (gameState.players[targetId]) {
            gameState.players[targetId].health -= amount;
            if (gameState.players[targetId].health <= 0) {
                gameState.players[targetId].alive = false;
            }
            io.emit('playerDamaged', { id: targetId, health: gameState.players[targetId].health });
            checkRoundEnd();
        }
    });

    socket.on('disconnect', () => {
        delete gameState.players[socket.id];
        delete gameState.teamAssignment[socket.id];
        console.log('Player disconnected:', socket.id);
    });
});

// Game Loop
setInterval(() => {
    io.emit('state', gameState.players);
}, 1000 / TICK_RATE);

// Start first round
setTimeout(resetRound, 2000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
