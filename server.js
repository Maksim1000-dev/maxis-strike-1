// MAXIS STRIKE Server v3.0
// Lobby System + Game Rooms + Maps + Modes

const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════════
// DATA STRUCTURES
// ═══════════════════════════════════════════

const rooms = {}; // roomId -> room data
const clients = new Map(); // ws -> client data
let nextRoomId = 1;
let nextPlayerId = 1;

// ═══════════════════════════════════════════
// MAP SPAWN POINTS
// ═══════════════════════════════════════════

const SPAWN_POINTS = {
  MS_DUST: {
    T: [
      { x: -40, y: 1.7, z: -40 },
      { x: -38, y: 1.7, z: -42 },
      { x: -42, y: 1.7, z: -38 },
      { x: -36, y: 1.7, z: -40 },
    ],
    CT: [
      { x: 40, y: 1.7, z: 40 },
      { x: 38, y: 1.7, z: 42 },
      { x: 42, y: 1.7, z: 38 },
      { x: 36, y: 1.7, z: 40 },
    ]
  },
  MS_START: {
    T: [
      { x: -20, y: 1.7, z: 0 },
      { x: -22, y: 1.7, z: 2 },
      { x: -22, y: 1.7, z: -2 },
      { x: -18, y: 1.7, z: 0 },
    ],
    CT: [
      { x: 20, y: 1.7, z: 0 },
      { x: 22, y: 1.7, z: 2 },
      { x: 22, y: 1.7, z: -2 },
      { x: 18, y: 1.7, z: 0 },
    ]
  }
};

// ═══════════════════════════════════════════
// HTTP SERVER
// ═══════════════════════════════════════════

const server = http.createServer((req, res) => {
  console.log('HTTP:', req.method, req.url);
  
  if (req.url === '/' || req.url === '/index.html') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading index.html');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else if (req.url === '/api/rooms') {
    // REST API for room list
    const roomList = Object.values(rooms).map(r => ({
      id: r.id,
      name: r.name,
      map: r.map,
      mode: r.mode,
      players: Object.keys(r.players).length,
      maxPlayers: r.maxPlayers,
      hasPassword: !!r.password
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(roomList));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// ═══════════════════════════════════════════
// WEBSOCKET SERVER
// ═══════════════════════════════════════════

const wss = new WebSocket.Server({ server });

console.log('═══════════════════════════════════════');
console.log('  MAXIS STRIKE Server v3.0');
console.log('  Port:', PORT);
console.log('  Lobby System + Game Rooms');
console.log('═══════════════════════════════════════');

wss.on('connection', (ws) => {
  const clientId = nextPlayerId++;
  clients.set(ws, { id: clientId, roomId: null, name: 'Player' + clientId });
  
  console.log(`Client ${clientId} connected. Total: ${clients.size}`);
  
  // Send client their ID
  ws.send(JSON.stringify({ type: 'welcome', id: clientId }));
  
  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch(e) { return; }
    
    const client = clients.get(ws);
    if (!client) return;
    
    handleMessage(ws, client, data);
  });
  
  ws.on('close', () => {
    const client = clients.get(ws);
    if (client) {
      leaveRoom(ws, client);
      console.log(`Client ${client.id} disconnected.`);
    }
    clients.delete(ws);
  });
  
  ws.on('error', (err) => {
    console.log('WebSocket error:', err.message);
  });
});

// ═══════════════════════════════════════════
// MESSAGE HANDLER
// ═══════════════════════════════════════════

function handleMessage(ws, client, data) {
  switch(data.type) {
    
    // ─── LOBBY ───
    case 'getRooms':
      sendRoomList(ws);
      break;
      
    case 'createRoom':
      createRoom(ws, client, data);
      break;
      
    case 'joinRoom':
      joinRoom(ws, client, data);
      break;
      
    case 'leaveRoom':
      leaveRoom(ws, client);
      sendRoomList(ws);
      break;
      
    case 'setName':
      client.name = (data.name || 'Player').substring(0, 16);
      if (client.roomId && rooms[client.roomId]) {
        const room = rooms[client.roomId];
        if (room.players[client.id]) {
          room.players[client.id].name = client.name;
          broadcastToRoom(room.id, { type: 'nameChange', id: client.id, name: client.name });
        }
      }
      break;
    
    // ─── IN-GAME ───
    case 'move':
      handleMove(ws, client, data);
      break;
      
    case 'shoot':
      handleShoot(ws, client, data);
      break;
      
    case 'switchWeapon':
      handleWeaponSwitch(ws, client, data);
      break;
      
    case 'chat':
      handleChat(ws, client, data);
      break;
      
    case 'rescueHostage':
      handleRescueHostage(ws, client, data);
      break;
  }
}

// ═══════════════════════════════════════════
// ROOM MANAGEMENT
// ═══════════════════════════════════════════

function sendRoomList(ws) {
  const roomList = Object.values(rooms).map(r => ({
    id: r.id,
    name: r.name,
    map: r.map,
    mode: r.mode,
    players: Object.keys(r.players).length,
    maxPlayers: r.maxPlayers,
    hasPassword: !!r.password
  }));
  ws.send(JSON.stringify({ type: 'roomList', rooms: roomList }));
}

function createRoom(ws, client, data) {
  const roomId = nextRoomId++;
  
  const room = {
    id: roomId,
    name: (data.name || 'Game Server').substring(0, 24),
    password: data.password || '',
    map: data.map || 'MS_START',
    mode: data.mode || 'deathmatch', // 'deathmatch' or 'hostage'
    maxPlayers: 16,
    players: {},
    hostages: [],
    scores: { T: 0, CT: 0 },
    roundTime: 180,
    roundStartTime: Date.now()
  };
  
  // Create hostages for hostage mode
  if (room.mode === 'hostage') {
    room.hostages = createHostages(room.map);
  }
  
  rooms[roomId] = room;
  
  console.log(`Room ${roomId} created: "${room.name}" [${room.map}] [${room.mode}]`);
  
  // Auto-join creator
  joinRoom(ws, client, { roomId, password: data.password });
  
  // Broadcast updated room list to all clients in lobby
  broadcastRoomList();
}

function joinRoom(ws, client, data) {
  const room = rooms[data.roomId];
  
  if (!room) {
    ws.send(JSON.stringify({ type: 'joinError', error: 'Room not found' }));
    return;
  }
  
  if (room.password && room.password !== data.password) {
    ws.send(JSON.stringify({ type: 'joinError', error: 'Wrong password' }));
    return;
  }
  
  if (Object.keys(room.players).length >= room.maxPlayers) {
    ws.send(JSON.stringify({ type: 'joinError', error: 'Room is full' }));
    return;
  }
  
  // Leave current room if in one
  if (client.roomId) {
    leaveRoom(ws, client);
  }
  
  // Determine team (balance teams)
  const tCount = Object.values(room.players).filter(p => p.team === 'T').length;
  const ctCount = Object.values(room.players).filter(p => p.team === 'CT').length;
  const team = tCount <= ctCount ? 'T' : 'CT';
  
  // Get spawn point
  const spawns = SPAWN_POINTS[room.map][team];
  const spawnIndex = Object.values(room.players).filter(p => p.team === team).length % spawns.length;
  const spawn = spawns[spawnIndex];
  
  // Create player
  const player = {
    id: client.id,
    name: client.name,
    team: team,
    x: spawn.x, y: spawn.y, z: spawn.z,
    rx: 0, ry: team === 'T' ? 0 : Math.PI,
    hp: 100,
    kills: 0,
    deaths: 0,
    alive: true,
    weapon: 'ak47',
    carryingHostage: null
  };
  
  room.players[client.id] = player;
  client.roomId = room.id;
  
  console.log(`Player ${client.id} (${client.name}) joined room ${room.id} as ${team}`);
  
  // Send join confirmation with full room state
  ws.send(JSON.stringify({
    type: 'joinedRoom',
    roomId: room.id,
    roomName: room.name,
    map: room.map,
    mode: room.mode,
    player: player,
    players: room.players,
    hostages: room.hostages,
    scores: room.scores
  }));
  
  // Broadcast new player to others in room
  broadcastToRoom(room.id, { type: 'playerJoin', player }, client.id);
  
  // Update lobby
  broadcastRoomList();
}

function leaveRoom(ws, client) {
  if (!client.roomId) return;
  
  const room = rooms[client.roomId];
  if (!room) {
    client.roomId = null;
    return;
  }
  
  // Broadcast leave to room
  broadcastToRoom(room.id, { type: 'playerLeave', id: client.id }, client.id);
  
  // Remove player
  delete room.players[client.id];
  client.roomId = null;
  
  console.log(`Player ${client.id} left room ${room.id}`);
  
  // Delete room if empty
  if (Object.keys(room.players).length === 0) {
    delete rooms[room.id];
    console.log(`Room ${room.id} deleted (empty)`);
  }
  
  // Update lobby
  broadcastRoomList();
}

function createHostages(map) {
  const hostages = [];
  const positions = map === 'MS_DUST' ? [
    { x: -30, y: 0, z: -30, id: 1 },
    { x: -25, y: 0, z: -35, id: 2 },
  ] : [
    { x: -15, y: 0, z: 5, id: 1 },
    { x: -15, y: 0, z: -5, id: 2 },
  ];
  
  for (const pos of positions) {
    hostages.push({
      id: pos.id,
      x: pos.x, y: pos.y, z: pos.z,
      rescued: false,
      followingPlayer: null
    });
  }
  
  return hostages;
}

// ═══════════════════════════════════════════
// GAME LOGIC
// ═══════════════════════════════════════════

function handleMove(ws, client, data) {
  const room = rooms[client.roomId];
  if (!room || !room.players[client.id]) return;
  
  const player = room.players[client.id];
  player.x = data.x;
  player.y = data.y;
  player.z = data.z;
  player.rx = data.rx;
  player.ry = data.ry;
  
  broadcastToRoom(room.id, {
    type: 'playerMove',
    id: client.id,
    x: data.x, y: data.y, z: data.z,
    rx: data.rx, ry: data.ry
  }, client.id);
  
  // Update hostages following this player
  for (const hostage of room.hostages) {
    if (hostage.followingPlayer === client.id) {
      hostage.x = data.x + Math.sin(data.ry) * 2;
      hostage.z = data.z + Math.cos(data.ry) * 2;
    }
  }
}

function handleShoot(ws, client, data) {
  const room = rooms[client.roomId];
  if (!room || !room.players[client.id]) return;
  
  const shooter = room.players[client.id];
  if (!shooter.alive) return;
  
  // Broadcast shot
  broadcastToRoom(room.id, {
    type: 'playerShoot',
    id: client.id,
    x: data.x, y: data.y, z: data.z,
    dx: data.dx, dy: data.dy, dz: data.dz,
    weapon: data.weapon
  }, client.id);
  
  // Server-side hit detection
  for (let pid in room.players) {
    if (pid == client.id) continue;
    
    const target = room.players[pid];
    if (!target.alive) continue;
    
    // In deathmatch with teams, can't shoot teammates
    // In hostage mode, same
    if (shooter.team === target.team && room.mode !== 'ffa') continue;
    
    const dist = checkRayHit(
      data.x, data.y, data.z,
      data.dx, data.dy, data.dz,
      target.x, target.y, target.z, 0.8
    );
    
    if (dist !== null && dist < 100) {
      const dmg = data.weapon === 'ak47' ? 27 : data.weapon === 'deagle' ? 45 : 55;
      const headshot = Math.abs((data.y + data.dy * dist) - (target.y + 0.5)) < 0.3;
      const finalDmg = headshot ? dmg * 3 : dmg;
      
      target.hp -= finalDmg;
      
      if (target.hp <= 0) {
        target.hp = 0;
        target.alive = false;
        target.deaths++;
        shooter.kills++;
        
        // Drop hostage if carrying
        if (target.carryingHostage) {
          const hostage = room.hostages.find(h => h.id === target.carryingHostage);
          if (hostage) {
            hostage.followingPlayer = null;
            hostage.x = target.x;
            hostage.z = target.z;
          }
          target.carryingHostage = null;
        }
        
        broadcastToRoom(room.id, {
          type: 'kill',
          killerId: parseInt(client.id),
          victimId: parseInt(pid),
          weapon: data.weapon,
          headshot
        });
        
        // Update scores in team modes
        if (room.mode === 'deathmatch') {
          room.scores[shooter.team]++;
        }
        
        // Respawn after 3s
        setTimeout(() => {
          respawnPlayer(room, parseInt(pid));
        }, 3000);
        
      } else {
        // Hit but not killed
        sendToPlayer(parseInt(pid), { type: 'hit', hp: target.hp, attackerId: parseInt(client.id) });
        sendToPlayer(parseInt(client.id), { type: 'hitConfirm', targetId: parseInt(pid), hp: target.hp, headshot });
      }
      
      break;
    }
  }
}

function handleWeaponSwitch(ws, client, data) {
  const room = rooms[client.roomId];
  if (!room || !room.players[client.id]) return;
  
  room.players[client.id].weapon = data.weapon;
  broadcastToRoom(room.id, { type: 'weaponSwitch', id: client.id, weapon: data.weapon }, client.id);
}

function handleChat(ws, client, data) {
  const room = rooms[client.roomId];
  if (!room) return;
  
  const msg = (data.msg || '').substring(0, 100);
  broadcastToRoom(room.id, {
    type: 'chat',
    id: client.id,
    name: client.name,
    team: room.players[client.id]?.team,
    msg
  });
}

function handleRescueHostage(ws, client, data) {
  const room = rooms[client.roomId];
  if (!room || room.mode !== 'hostage') return;
  
  const player = room.players[client.id];
  if (!player || !player.alive || player.team !== 'CT') return;
  
  const hostage = room.hostages.find(h => h.id === data.hostageId);
  if (!hostage || hostage.rescued) return;
  
  // Check if player is near hostage
  const dx = player.x - hostage.x;
  const dz = player.z - hostage.z;
  const dist = Math.sqrt(dx*dx + dz*dz);
  
  if (dist < 3) {
    if (hostage.followingPlayer === null) {
      // Pick up hostage
      hostage.followingPlayer = client.id;
      player.carryingHostage = hostage.id;
      broadcastToRoom(room.id, { type: 'hostagePickup', playerId: client.id, hostageId: hostage.id });
    }
  }
  
  // Check if at rescue zone (CT spawn area)
  const rescueZone = SPAWN_POINTS[room.map].CT[0];
  const rdx = player.x - rescueZone.x;
  const rdz = player.z - rescueZone.z;
  const rDist = Math.sqrt(rdx*rdx + rdz*rdz);
  
  if (rDist < 10 && player.carryingHostage === hostage.id) {
    hostage.rescued = true;
    hostage.followingPlayer = null;
    player.carryingHostage = null;
    room.scores.CT++;
    
    broadcastToRoom(room.id, { type: 'hostageRescued', playerId: client.id, hostageId: hostage.id, scores: room.scores });
    
    // Check win condition
    if (room.hostages.every(h => h.rescued)) {
      broadcastToRoom(room.id, { type: 'roundEnd', winner: 'CT', reason: 'All hostages rescued!' });
      // Reset round after delay
      setTimeout(() => resetRound(room), 5000);
    }
  }
}

function respawnPlayer(room, playerId) {
  if (!room || !room.players[playerId]) return;
  
  const player = room.players[playerId];
  const spawns = SPAWN_POINTS[room.map][player.team];
  const spawn = spawns[Math.floor(Math.random() * spawns.length)];
  
  player.hp = 100;
  player.alive = true;
  player.x = spawn.x;
  player.y = spawn.y;
  player.z = spawn.z;
  player.carryingHostage = null;
  
  broadcastToRoom(room.id, {
    type: 'respawn',
    id: playerId,
    x: spawn.x, y: spawn.y, z: spawn.z
  });
}

function resetRound(room) {
  // Reset hostages
  room.hostages = createHostages(room.map);
  
  // Respawn all players
  for (let pid in room.players) {
    respawnPlayer(room, parseInt(pid));
  }
  
  room.roundStartTime = Date.now();
  broadcastToRoom(room.id, { type: 'roundStart', hostages: room.hostages });
}

// ═══════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════

function checkRayHit(ox, oy, oz, dx, dy, dz, tx, ty, tz, radius) {
  const ex = ox - tx, ey = oy - ty, ez = oz - tz;
  const a = dx*dx + dy*dy + dz*dz;
  const b = 2*(ex*dx + ey*dy + ez*dz);
  const c = ex*ex + ey*ey + ez*ez - radius*radius;
  let disc = b*b - 4*a*c;
  if (disc < 0) return null;
  disc = Math.sqrt(disc);
  const t1 = (-b - disc) / (2*a);
  const t2 = (-b + disc) / (2*a);
  if (t1 > 0) return t1;
  if (t2 > 0) return t2;
  return null;
}

function broadcastToRoom(roomId, data, excludeId) {
  const room = rooms[roomId];
  if (!room) return;
  
  const msg = JSON.stringify(data);
  
  for (const [ws, client] of clients.entries()) {
    if (client.roomId === roomId && client.id !== excludeId) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }
}

function sendToPlayer(playerId, data) {
  for (const [ws, client] of clients.entries()) {
    if (client.id === playerId && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
      break;
    }
  }
}

function broadcastRoomList() {
  const roomList = Object.values(rooms).map(r => ({
    id: r.id,
    name: r.name,
    map: r.map,
    mode: r.mode,
    players: Object.keys(r.players).length,
    maxPlayers: r.maxPlayers,
    hasPassword: !!r.password
  }));
  
  const msg = JSON.stringify({ type: 'roomList', rooms: roomList });
  
  for (const [ws, client] of clients.entries()) {
    // Send to clients not in a room (in lobby)
    if (!client.roomId && ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

// ═══════════════════════════════════════════
// STATE SYNC
// ═══════════════════════════════════════════

setInterval(() => {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (Object.keys(room.players).length > 0) {
      broadcastToRoom(roomId, {
        type: 'state',
        players: room.players,
        hostages: room.hostages,
        scores: room.scores
      });
    }
  }
}, 50);

// Keep-alive
setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  });
}, 30000);

// ═══════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} to play!`);
});
