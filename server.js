const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    connectionClass: require('socket.io').Connection,
    pingInterval: 10000,
    pingTimeout: 5000,
    cors: {
        origin: "*",
    }
});

app.use(express.static(path.join(__dirname, '/')));

const players = {};
const gameState = {
    players: {},
};

// Optimization: Pre-calculate tick rate
const TICK_RATE = 30; 
const TICK_INTERVAL = 1000 / TICK_RATE;

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    socket.on('join', (data) => {
        players[socket.id] = {
            x: data.x || 400,
            y: data.y || 300,
            color: data.color || '#' + Math.floor(Math.random()*16777215).toString(16),
            id: socket.id
        };
    });

    socket.on('move', (data) => {
        if (players[socket.id]) {
            // Optimization: Update state directly to minimize overhead
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
        }
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        delete players[socket.id];
    });
});

// Optimization: Centralized game loop for consistent tick rate and reduced network congestion
setInterval(() => {
    io.emit('state', players);
}, TICK_INTERVAL);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
