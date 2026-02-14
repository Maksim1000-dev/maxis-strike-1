// MAXIS STRIKE Server v5.0
// RPG, Physics, Destruction, Money System, Shop

const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════════
// DATA STRUCTURES
// ═══════════════════════════════════════════

const rooms = {};
const clients = new Map();
const leaderboard = {};

// Weapon prices
const WEAPON_PRICES = {
  knife: 0,
  usp: 500,
  deagle: 1500,
  ak47: 2000,
  m4a1: 2500,
  awp: 4000,
  rpg: 5000
};

// Weapon damage
const WEAPON_DAMAGE = {
  knife: 55,
  usp: 25,
  deagle: 45,
  ak47: 27,
  m4a1: 30,
  awp: 100,
  rpg: 150
};

const achievements = {
  FIRST_BLOOD: { id: 'FIRST_BLOOD', name: 'First Blood', desc: 'Get the first kill', icon: '🩸' },
  HEADHUNTER: { id: 'HEADHUNTER', name: 'Headhunter', desc: '10 headshots', icon: '🎯' },
  RAMPAGE: { id: 'RAMPAGE', name: 'Rampage', desc: '5 kills without dying', icon: '💀' },
  KNIFE_MASTER: { id: 'KNIFE_MASTER', name: 'Knife Master', desc: 'Kill with knife', icon: '🔪' },
  DEMOLITION: { id: 'DEMOLITION', name: 'Demolition Expert', desc: 'Destroy 10 walls with RPG', icon: '💥' },
  RICH: { id: 'RICH', name: 'Rich Boy', desc: 'Have $10000', icon: '💰' },
};

let nextRoomId = 1;
let nextPlayerId = 1;

// ═══════════════════════════════════════════
// MAP CONFIGURATIONS
// ═══════════════════════════════════════════

const MAP_CONFIGS = {
  'MS_START': {
    maxPlayers: 16,
    spawnT: [
      { x: -25, y: 1.7, z: 0 }, { x: -27, y: 1.7, z: 3 },
      { x: -27, y: 1.7, z: -3 }, { x: -23, y: 1.7, z: 0 }
    ],
    spawnCT: [
      { x: 25, y: 1.7, z: 0 }, { x: 27, y: 1.7, z: 3 },
      { x: 27, y: 1.7, z: -3 }, { x: 23, y: 1.7, z: 0 }
    ],
    buyZoneT: { x: -25, z: 0, radius: 8 },
    buyZoneCT: { x: 25, z: 0, radius: 8 },
    destructible: false
  },
  'MS_DUST': {
    maxPlayers: 16,
    spawnT: [
      { x: -45, y: 1.7, z: -45 }, { x: -43, y: 1.7, z: -47 },
      { x: -47, y: 1.7, z: -43 }, { x: -41, y: 1.7, z: -45 }
    ],
    spawnCT: [
      { x: 45, y: 1.7, z: 45 }, { x: 43, y: 1.7, z: 47 },
      { x: 47, y: 1.7, z: 43 }, { x: 41, y: 1.7, z: 45 }
    ],
    buyZoneT: { x: -45, z: -45, radius: 10 },
    buyZoneCT: { x: 45, z: 45, radius: 10 },
    destructible: false
  },
  'MS_ARENA_BETA': {
    maxPlayers: 10,
    baseSize: 30,
    expandPerPlayer: 5,
    spawnT: [
      { x: -15, y: 1.7, z: 0 }, { x: -17, y: 1.7, z: 3 },
      { x: -17, y: 1.7, z: -3 }, { x: -13, y: 1.7, z: 0 }
    ],
    spawnCT: [
      { x: 15, y: 1.7, z: 0 }, { x: 17, y: 1.7, z: 3 },
      { x: 17, y: 1.7, z: -3 }, { x: 13, y: 1.7, z: 0 }
    ],
    buyZoneT: { x: -15, z: 0, radius: 6 },
    buyZoneCT: { x: 15, z: 0, radius: 6 },
    destructible: true
  }
};

// ═══════════════════════════════════════════
// ANTICHEAT SYSTEM
// ═══════════════════════════════════════════

const ANTICHEAT = {
  MAX_SPEED: 25,
  MAX_TELEPORT: 20,
  MAX_FIRE_RATE: 40,
};

function anticheatCheck(client, room, data) {
  const player = room.players[client.id];
  if (!player) return { valid: true };
  
  const now = Date.now();
  
  if (!player.ac) {
    player.ac = {
      lastPos: { x: player.x, y: player.y, z: player.z },
      lastPosTime: now,
      lastShot: 0,
      violations: 0
    };
  }
  
  const ac = player.ac;
  
  if (data.type === 'move') {
    const dx = data.x - ac.lastPos.x;
    const dy = data.y - ac.lastPos.y;
    const dz = data.z - ac.lastPos.z;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    const dt = (now - ac.lastPosTime) / 1000;
    
    if (dist > ANTICHEAT.MAX_TELEPORT) {
      ac.violations++;
      if (ac.violations > 5) {
        return { valid: false, reason: 'Teleport detected', kick: true };
      }
      return { valid: false, reason: 'Invalid position' };
    }
    
    if (dt > 0.01) {
      const speed = dist / dt;
      if (speed > ANTICHEAT.MAX_SPEED) {
        ac.violations++;
        if (ac.violations > 10) {
          return { valid: false, reason: 'Speed hack detected', kick: true };
        }
      }
    }
    
    ac.lastPos = { x: data.x, y: data.y, z: data.z };
    ac.lastPosTime = now;
  }
  
  if (data.type === 'shoot') {
    const timeSinceLastShot = now - ac.lastShot;
    if (timeSinceLastShot < ANTICHEAT.MAX_FIRE_RATE && data.weapon !== 'rpg') {
      ac.violations++;
      return { valid: false, reason: 'Fire rate too fast' };
    }
    ac.lastShot = now;
  }
  
  return { valid: true };
}

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
    const roomList = Object.values(rooms).map(r => ({
      id: r.id, name: r.name, map: r.map, mode: r.mode,
      players: Object.keys(r.players).length,
      maxPlayers: r.maxPlayers, hasPassword: !!r.password
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(roomList));
  } else if (req.url === '/api/leaderboard') {
    const sorted = Object.values(leaderboard)
      .sort((a, b) => b.kills - a.kills)
      .slice(0, 100);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(sorted));
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
console.log('  MAXIS STRIKE Server v5.0');
console.log('  Port:', PORT);
console.log('  Features: RPG, Physics, Destruction, Shop');
console.log('═══════════════════════════════════════');

wss.on('connection', (ws) => {
  const clientId = nextPlayerId++;
  const clientData = {
    id: clientId,
    oderId: null,
    roomId: null,
    name: 'Player' + clientId,
    achievements: [],
    stats: { kills: 0, deaths: 0, headshots: 0, killStreak: 0, wallsDestroyed: 0 }
  };
  clients.set(ws, clientData);
  
  console.log(`Client ${clientId} connected. Total: ${clients.size}`);
  
  ws.send(JSON.stringify({ 
    type: 'welcome', 
    id: clientId, 
    achievements: Object.values(achievements),
    weaponPrices: WEAPON_PRICES
  }));
  
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
  if (client.roomId && rooms[client.roomId]) {
    const room = rooms[client.roomId];
    if (data.type === 'move' || data.type === 'shoot') {
      const acResult = anticheatCheck(client, room, data);
      if (!acResult.valid) {
        if (acResult.kick) {
          ws.send(JSON.stringify({ type: 'kicked', reason: acResult.reason }));
          ws.close();
          return;
        }
        return;
      }
    }
  }
  
  switch(data.type) {
    case 'getRooms': sendRoomList(ws); break;
    case 'createRoom': createRoom(ws, client, data); break;
    case 'joinRoom': joinRoom(ws, client, data); break;
    case 'leaveRoom': leaveRoom(ws, client); sendRoomList(ws); break;
    case 'setName':
      client.name = (data.name || 'Player').substring(0, 16);
      if (!client.oderId && data.oderId) {
        client.oderId = data.oderId;
        if (!leaderboard[client.oderId]) {
          leaderboard[client.oderId] = { name: client.name, oderId: client.oderId, kills: 0, deaths: 0, headshots: 0, wins: 0 };
        } else {
          leaderboard[client.oderId].name = client.name;
        }
      }
      if (client.roomId && rooms[client.roomId]) {
        const room = rooms[client.roomId];
        if (room.players[client.id]) {
          room.players[client.id].name = client.name;
          broadcastToRoom(room.id, { type: 'nameChange', id: client.id, name: client.name });
        }
      }
      break;
    case 'move': handleMove(ws, client, data); break;
    case 'shoot': handleShoot(ws, client, data); break;
    case 'switchWeapon': handleWeaponSwitch(ws, client, data); break;
    case 'buyWeapon': handleBuyWeapon(ws, client, data); break;
    case 'chat': handleChat(ws, client, data); break;
    case 'rpgExplode': handleRPGExplosion(ws, client, data); break;
    case 'destroyWall': handleDestroyWall(ws, client, data); break;
    case 'getLeaderboard': sendLeaderboard(ws); break;
  }
}

// ═══════════════════════════════════════════
// ROOM MANAGEMENT
// ═══════════════════════════════════════════

function sendRoomList(ws) {
  const roomList = Object.values(rooms).map(r => ({
    id: r.id, name: r.name, map: r.map, mode: r.mode,
    players: Object.keys(r.players).length,
    maxPlayers: r.maxPlayers, hasPassword: !!r.password
  }));
  ws.send(JSON.stringify({ type: 'roomList', rooms: roomList }));
}

function sendLeaderboard(ws) {
  const sorted = Object.values(leaderboard)
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 50);
  ws.send(JSON.stringify({ type: 'leaderboard', data: sorted }));
}

function createRoom(ws, client, data) {
  const roomId = nextRoomId++;
  const mapConfig = MAP_CONFIGS[data.map] || MAP_CONFIGS['MS_START'];
  
  const room = {
    id: roomId,
    name: (data.name || 'Game Server').substring(0, 24),
    password: data.password || '',
    map: data.map || 'MS_START',
    mode: data.mode || 'deathmatch',
    maxPlayers: mapConfig.maxPlayers,
    players: {},
    destructibleWalls: [],
    physicsObjects: [],
    debris: [],
    scores: { T: 0, CT: 0 },
    roundTime: 180,
    roundStartTime: Date.now(),
    firstBloodTaken: false,
    mapSize: mapConfig.baseSize || 50
  };
  
  // Initialize destructible walls for MS_ARENA_BETA
  if (data.map === 'MS_ARENA_BETA') {
    room.destructibleWalls = generateDestructibleWalls(room.mapSize);
    room.physicsObjects = generatePhysicsObjects(room.mapSize);
  }
  
  rooms[roomId] = room;
  console.log(`Room ${roomId} created: "${room.name}" [${room.map}] [${room.mode}]`);
  
  joinRoom(ws, client, { roomId, password: data.password });
  broadcastRoomList();
}

function generateDestructibleWalls(size) {
  const walls = [];
  const wallId = { current: 1 };
  
  // Generate some destructible walls
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const dist = size * 0.5;
    walls.push({
      id: wallId.current++,
      x: Math.cos(angle) * dist,
      y: 2,
      z: Math.sin(angle) * dist,
      width: 4,
      height: 4,
      depth: 0.5,
      hp: 100,
      destroyed: false
    });
  }
  
  // Center walls
  walls.push({ id: wallId.current++, x: 0, y: 2, z: -8, width: 6, height: 4, depth: 0.5, hp: 100, destroyed: false });
  walls.push({ id: wallId.current++, x: 0, y: 2, z: 8, width: 6, height: 4, depth: 0.5, hp: 100, destroyed: false });
  walls.push({ id: wallId.current++, x: -8, y: 2, z: 0, width: 0.5, height: 4, depth: 6, hp: 100, destroyed: false });
  walls.push({ id: wallId.current++, x: 8, y: 2, z: 0, width: 0.5, height: 4, depth: 6, hp: 100, destroyed: false });
  
  return walls;
}

function generatePhysicsObjects(size) {
  const objects = [];
  const objId = { current: 1 };
  
  // Barrels
  for (let i = 0; i < 12; i++) {
    objects.push({
      id: objId.current++,
      type: 'barrel',
      x: (Math.random() - 0.5) * size * 0.8,
      y: 0.6,
      z: (Math.random() - 0.5) * size * 0.8,
      vx: 0, vy: 0, vz: 0,
      radius: 0.5,
      mass: 50,
      destroyed: false
    });
  }
  
  // Crates
  for (let i = 0; i < 8; i++) {
    objects.push({
      id: objId.current++,
      type: 'crate',
      x: (Math.random() - 0.5) * size * 0.8,
      y: 0.75,
      z: (Math.random() - 0.5) * size * 0.8,
      vx: 0, vy: 0, vz: 0,
      size: 1.5,
      mass: 80,
      destroyed: false
    });
  }
  
  return objects;
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
  
  if (client.roomId) leaveRoom(ws, client);
  
  const tCount = Object.values(room.players).filter(p => p.team === 'T').length;
  const ctCount = Object.values(room.players).filter(p => p.team === 'CT').length;
  const team = tCount <= ctCount ? 'T' : 'CT';
  
  const mapConfig = MAP_CONFIGS[room.map];
  const spawns = team === 'T' ? mapConfig.spawnT : mapConfig.spawnCT;
  const spawnIndex = Object.values(room.players).filter(p => p.team === team).length % spawns.length;
  const spawn = spawns[spawnIndex];
  
  // Expand map if MS_ARENA_BETA
  if (room.map === 'MS_ARENA_BETA') {
    const playerCount = Object.keys(room.players).length + 1;
    room.mapSize = mapConfig.baseSize + (playerCount * mapConfig.expandPerPlayer);
    broadcastToRoom(room.id, { type: 'mapResize', size: room.mapSize });
  }
  
  const player = {
    id: client.id,
    name: client.name,
    team: team,
    x: spawn.x, y: spawn.y, z: spawn.z,
    rx: 0, ry: team === 'T' ? 0 : Math.PI,
    hp: 100,
    money: 800, // Starting money
    kills: 0,
    deaths: 0,
    alive: true,
    weapon: 'knife',
    weapons: ['knife'], // Owned weapons
    killStreak: 0
  };
  
  room.players[client.id] = player;
  client.roomId = room.id;
  client.stats = { kills: 0, deaths: 0, headshots: 0, killStreak: 0, wallsDestroyed: 0 };
  
  console.log(`Player ${client.id} (${client.name}) joined room ${room.id} as ${team}`);
  
  ws.send(JSON.stringify({
    type: 'joinedRoom',
    roomId: room.id,
    roomName: room.name,
    map: room.map,
    mode: room.mode,
    player: player,
    players: room.players,
    destructibleWalls: room.destructibleWalls,
    physicsObjects: room.physicsObjects,
    scores: room.scores,
    mapSize: room.mapSize,
    weaponPrices: WEAPON_PRICES
  }));
  
  broadcastToRoom(room.id, { type: 'playerJoin', player }, client.id);
  broadcastRoomList();
}

function leaveRoom(ws, client) {
  if (!client.roomId) return;
  
  const room = rooms[client.roomId];
  if (!room) {
    client.roomId = null;
    return;
  }
  
  broadcastToRoom(room.id, { type: 'playerLeave', id: client.id }, client.id);
  delete room.players[client.id];
  client.roomId = null;
  
  // Shrink map if MS_ARENA_BETA
  if (room.map === 'MS_ARENA_BETA') {
    const mapConfig = MAP_CONFIGS[room.map];
    const playerCount = Object.keys(room.players).length;
    room.mapSize = mapConfig.baseSize + (playerCount * mapConfig.expandPerPlayer);
    broadcastToRoom(room.id, { type: 'mapResize', size: room.mapSize });
  }
  
  console.log(`Player ${client.id} left room ${room.id}`);
  
  if (Object.keys(room.players).length === 0) {
    delete rooms[room.id];
    console.log(`Room ${room.id} deleted (empty)`);
  }
  
  broadcastRoomList();
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
}

function handleShoot(ws, client, data) {
  const room = rooms[client.roomId];
  if (!room || !room.players[client.id]) return;
  
  const shooter = room.players[client.id];
  if (!shooter.alive) return;
  
  const weapon = data.weapon;
  const damage = WEAPON_DAMAGE[weapon] || 25;
  
  broadcastToRoom(room.id, {
    type: 'playerShoot',
    id: client.id,
    x: data.x, y: data.y, z: data.z,
    dx: data.dx, dy: data.dy, dz: data.dz,
    weapon: weapon
  }, client.id);
  
  // RPG handled separately
  if (weapon === 'rpg') return;
  
  // Check hits on players
  for (let pid in room.players) {
    if (pid == client.id) continue;
    
    const target = room.players[pid];
    if (!target.alive) continue;
    if (shooter.team === target.team && room.mode !== 'ffa') continue;
    
    const dist = checkRayHit(
      data.x, data.y, data.z,
      data.dx, data.dy, data.dz,
      target.x, target.y, target.z, 0.8
    );
    
    if (dist !== null && dist < 100) {
      const headshot = Math.abs((data.y + data.dy * dist) - (target.y + 0.5)) < 0.3;
      const finalDmg = headshot ? damage * 3 : damage;
      
      target.hp -= finalDmg;
      
      if (target.hp <= 0) {
        handleKill(room, client, shooter, target, parseInt(pid), weapon, headshot);
      } else {
        sendToPlayer(parseInt(pid), { 
          type: 'hit', 
          hp: target.hp, 
          attackerId: parseInt(client.id),
          fromX: shooter.x,
          fromZ: shooter.z
        });
        sendToPlayer(parseInt(client.id), { type: 'hitConfirm', targetId: parseInt(pid), hp: target.hp, headshot });
      }
      
      break;
    }
  }
}

function handleKill(room, client, shooter, target, targetId, weapon, headshot) {
  target.hp = 0;
  target.alive = false;
  target.deaths++;
  shooter.kills++;
  shooter.killStreak++;
  shooter.money += 500; // Kill reward
  client.stats.kills++;
  if (headshot) client.stats.headshots++;
  
  // Target loses money
  target.money = Math.max(0, target.money - 200);
  
  // Update leaderboard
  if (client.oderId && leaderboard[client.oderId]) {
    leaderboard[client.oderId].kills++;
    if (headshot) leaderboard[client.oderId].headshots++;
  }
  
  // Reset target kill streak
  const targetClient = getClientByPlayerId(targetId);
  if (targetClient) {
    targetClient.stats.killStreak = 0;
    targetClient.stats.deaths++;
    if (targetClient.oderId && leaderboard[targetClient.oderId]) {
      leaderboard[targetClient.oderId].deaths++;
    }
  }
  
  // Kill-cam data
  const killCamData = {
    killerId: parseInt(client.id),
    killerName: shooter.name,
    killerPos: { x: shooter.x, y: shooter.y, z: shooter.z },
    killerRot: { rx: shooter.rx, ry: shooter.ry },
    victimPos: { x: target.x, y: target.y, z: target.z },
    weapon: weapon,
    headshot
  };
  
  broadcastToRoom(room.id, {
    type: 'kill',
    killerId: parseInt(client.id),
    victimId: targetId,
    weapon: weapon,
    headshot,
    killCam: killCamData,
    killerMoney: shooter.money,
    victimMoney: target.money
  });
  
  if (room.mode === 'deathmatch') {
    room.scores[shooter.team]++;
  }
  
  setTimeout(() => respawnPlayer(room, targetId), 3000);
}

function handleRPGExplosion(ws, client, data) {
  const room = rooms[client.roomId];
  if (!room) return;
  
  const shooter = room.players[client.id];
  if (!shooter) return;
  
  const explosionRadius = 8;
  const explosionDamage = 150;
  
  // Damage players
  for (let pid in room.players) {
    const target = room.players[pid];
    if (!target.alive) continue;
    if (shooter.team === target.team && room.mode !== 'ffa' && pid != client.id) continue;
    
    const dx = target.x - data.x;
    const dy = target.y - data.y;
    const dz = target.z - data.z;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    
    if (dist < explosionRadius) {
      const falloff = 1 - (dist / explosionRadius);
      const damage = Math.floor(explosionDamage * falloff);
      target.hp -= damage;
      
      if (target.hp <= 0 && pid != client.id) {
        handleKill(room, client, shooter, target, parseInt(pid), 'rpg', false);
        
        // Send gib effect for RPG kills
        broadcastToRoom(room.id, {
          type: 'gibEffect',
          x: target.x, y: target.y, z: target.z
        });
      } else if (target.hp > 0) {
        sendToPlayer(parseInt(pid), { type: 'hit', hp: target.hp, attackerId: client.id });
      }
    }
  }
  
  // Push physics objects
  for (const obj of room.physicsObjects) {
    if (obj.destroyed) continue;
    
    const dx = obj.x - data.x;
    const dz = obj.z - data.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    
    if (dist < explosionRadius && dist > 0) {
      const force = (1 - dist / explosionRadius) * 20;
      obj.vx = (dx / dist) * force;
      obj.vy = 5;
      obj.vz = (dz / dist) * force;
      
      // Destroy barrels
      if (obj.type === 'barrel' && dist < 3) {
        obj.destroyed = true;
        broadcastToRoom(room.id, {
          type: 'objectDestroyed',
          id: obj.id,
          x: obj.x, y: obj.y, z: obj.z,
          debrisCount: 8
        });
      }
    }
  }
  
  // Broadcast physics update
  broadcastToRoom(room.id, {
    type: 'physicsUpdate',
    objects: room.physicsObjects.filter(o => !o.destroyed)
  });
  
  // Broadcast explosion
  broadcastToRoom(room.id, {
    type: 'explosion',
    x: data.x, y: data.y, z: data.z,
    radius: explosionRadius
  });
}

function handleDestroyWall(ws, client, data) {
  const room = rooms[client.roomId];
  if (!room || room.map !== 'MS_ARENA_BETA') return;
  
  const wall = room.destructibleWalls.find(w => w.id === data.wallId);
  if (!wall || wall.destroyed) return;
  
  wall.hp -= data.damage || 100;
  
  if (wall.hp <= 0) {
    wall.destroyed = true;
    client.stats.wallsDestroyed++;
    
    // Generate debris
    const debris = [];
    for (let i = 0; i < 12; i++) {
      debris.push({
        id: Date.now() + i,
        x: wall.x + (Math.random() - 0.5) * wall.width,
        y: wall.y + (Math.random() - 0.5) * wall.height,
        z: wall.z + (Math.random() - 0.5) * wall.depth,
        vx: (Math.random() - 0.5) * 10,
        vy: Math.random() * 5,
        vz: (Math.random() - 0.5) * 10,
        size: 0.2 + Math.random() * 0.4,
        life: 30 // seconds
      });
    }
    
    broadcastToRoom(room.id, {
      type: 'wallDestroyed',
      wallId: wall.id,
      debris: debris
    });
    
    // Check achievement
    if (client.stats.wallsDestroyed >= 10) {
      if (!client.achievements.includes('DEMOLITION')) {
        client.achievements.push('DEMOLITION');
        ws.send(JSON.stringify({ type: 'newAchievements', achievements: [achievements.DEMOLITION] }));
      }
    }
  } else {
    broadcastToRoom(room.id, {
      type: 'wallDamaged',
      wallId: wall.id,
      hp: wall.hp
    });
  }
}

function handleBuyWeapon(ws, client, data) {
  const room = rooms[client.roomId];
  if (!room || !room.players[client.id]) return;
  
  const player = room.players[client.id];
  if (!player.alive) return;
  
  const weapon = data.weapon;
  const price = WEAPON_PRICES[weapon];
  
  if (price === undefined) {
    ws.send(JSON.stringify({ type: 'buyError', error: 'Unknown weapon' }));
    return;
  }
  
  // Check if already owned
  if (player.weapons.includes(weapon)) {
    ws.send(JSON.stringify({ type: 'buyError', error: 'Already owned' }));
    return;
  }
  
  // Check buy zone
  const mapConfig = MAP_CONFIGS[room.map];
  const buyZone = player.team === 'T' ? mapConfig.buyZoneT : mapConfig.buyZoneCT;
  const dx = player.x - buyZone.x;
  const dz = player.z - buyZone.z;
  const dist = Math.sqrt(dx*dx + dz*dz);
  
  if (dist > buyZone.radius) {
    ws.send(JSON.stringify({ type: 'buyError', error: 'Not in buy zone!' }));
    return;
  }
  
  // Check money
  if (player.money < price) {
    ws.send(JSON.stringify({ type: 'buyError', error: 'Not enough money!' }));
    return;
  }
  
  // Buy weapon
  player.money -= price;
  player.weapons.push(weapon);
  player.weapon = weapon;
  
  ws.send(JSON.stringify({
    type: 'weaponBought',
    weapon: weapon,
    money: player.money,
    weapons: player.weapons
  }));
  
  broadcastToRoom(room.id, { type: 'weaponSwitch', id: client.id, weapon: weapon }, client.id);
  
  // Check rich achievement
  if (player.money >= 10000) {
    if (!client.achievements.includes('RICH')) {
      client.achievements.push('RICH');
      ws.send(JSON.stringify({ type: 'newAchievements', achievements: [achievements.RICH] }));
    }
  }
}

function handleWeaponSwitch(ws, client, data) {
  const room = rooms[client.roomId];
  if (!room || !room.players[client.id]) return;
  
  const player = room.players[client.id];
  
  // Check if owns weapon
  if (!player.weapons.includes(data.weapon)) {
    ws.send(JSON.stringify({ type: 'switchError', error: 'Weapon not owned' }));
    return;
  }
  
  player.weapon = data.weapon;
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

function respawnPlayer(room, playerId) {
  if (!room || !room.players[playerId]) return;
  
  const player = room.players[playerId];
  const mapConfig = MAP_CONFIGS[room.map];
  const spawns = player.team === 'T' ? mapConfig.spawnT : mapConfig.spawnCT;
  const spawn = spawns[Math.floor(Math.random() * spawns.length)];
  
  player.hp = 100;
  player.alive = true;
  player.x = spawn.x;
  player.y = spawn.y;
  player.z = spawn.z;
  player.killStreak = 0;
  player.weapon = 'knife';
  player.weapons = ['knife'];
  
  broadcastToRoom(room.id, {
    type: 'respawn',
    id: playerId,
    x: spawn.x, y: spawn.y, z: spawn.z,
    money: player.money
  });
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

function getClientByPlayerId(playerId) {
  for (const [ws, client] of clients.entries()) {
    if (client.id === playerId) return client;
  }
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
    id: r.id, name: r.name, map: r.map, mode: r.mode,
    players: Object.keys(r.players).length,
    maxPlayers: r.maxPlayers, hasPassword: !!r.password
  }));
  
  const msg = JSON.stringify({ type: 'roomList', rooms: roomList });
  
  for (const [ws, client] of clients.entries()) {
    if (!client.roomId && ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

// ═══════════════════════════════════════════
// PHYSICS UPDATE LOOP
// ═══════════════════════════════════════════

setInterval(() => {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    
    // Update physics objects
    if (room.physicsObjects) {
      let changed = false;
      for (const obj of room.physicsObjects) {
        if (obj.destroyed) continue;
        if (Math.abs(obj.vx) > 0.01 || Math.abs(obj.vy) > 0.01 || Math.abs(obj.vz) > 0.01) {
          obj.x += obj.vx * 0.05;
          obj.y += obj.vy * 0.05;
          obj.z += obj.vz * 0.05;
          
          // Gravity
          obj.vy -= 0.5;
          
          // Ground collision
          const groundY = obj.type === 'barrel' ? 0.6 : 0.75;
          if (obj.y < groundY) {
            obj.y = groundY;
            obj.vy = -obj.vy * 0.3;
            obj.vx *= 0.8;
            obj.vz *= 0.8;
          }
          
          // Friction
          obj.vx *= 0.95;
          obj.vz *= 0.95;
          
          changed = true;
        }
      }
      
      if (changed) {
        broadcastToRoom(roomId, {
          type: 'physicsUpdate',
          objects: room.physicsObjects.filter(o => !o.destroyed)
        });
      }
    }
  }
}, 50);

// State sync
setInterval(() => {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (Object.keys(room.players).length > 0) {
      broadcastToRoom(roomId, {
        type: 'state',
        players: room.players,
        scores: room.scores
      });
    }
  }
}, 50);

// Ping
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
