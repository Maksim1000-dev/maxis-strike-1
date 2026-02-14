// MAXIS STRIKE Server v5.1
// Fixed spawns, barrel collisions, maps, cheat support

const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;

const rooms = {};
const clients = new Map();
const leaderboard = {};

const WEAPON_PRICES = {
  knife: 0, usp: 500, deagle: 1500, ak47: 2000, m4a1: 2500, awp: 4000, rpg: 5000
};

const WEAPON_DAMAGE = {
  knife: 55, usp: 25, deagle: 45, ak47: 27, m4a1: 30, awp: 100, rpg: 150
};

const achievements = {
  FIRST_BLOOD: { id: 'FIRST_BLOOD', name: 'First Blood', desc: 'Get the first kill', icon: '🩸' },
  HEADHUNTER: { id: 'HEADHUNTER', name: 'Headhunter', desc: '10 headshots', icon: '🎯' },
  RAMPAGE: { id: 'RAMPAGE', name: 'Rampage', desc: '5 kills without dying', icon: '💀' },
  KNIFE_MASTER: { id: 'KNIFE_MASTER', name: 'Knife Master', desc: 'Kill with knife', icon: '🔪' },
  DEMOLITION: { id: 'DEMOLITION', name: 'Demolition Expert', desc: 'Destroy 10 walls', icon: '💥' },
  RICH: { id: 'RICH', name: 'Rich Boy', desc: 'Have $10000', icon: '💰' },
};

let nextRoomId = 1;
let nextPlayerId = 1;

// ═══════════════════════════════════════════
// MAP CONFIGS — FIXED SPAWNS
// ═══════════════════════════════════════════

const MAP_CONFIGS = {
  'MS_START': {
    maxPlayers: 16,
    spawnT: [
      { x: -25, y: 1.7, z: 0 }, { x: -27, y: 1.7, z: 4 },
      { x: -27, y: 1.7, z: -4 }, { x: -23, y: 1.7, z: 4 },
      { x: -23, y: 1.7, z: -4 }, { x: -29, y: 1.7, z: 0 },
      { x: -25, y: 1.7, z: 6 }, { x: -25, y: 1.7, z: -6 }
    ],
    spawnCT: [
      { x: 25, y: 1.7, z: 0 }, { x: 27, y: 1.7, z: 4 },
      { x: 27, y: 1.7, z: -4 }, { x: 23, y: 1.7, z: 4 },
      { x: 23, y: 1.7, z: -4 }, { x: 29, y: 1.7, z: 0 },
      { x: 25, y: 1.7, z: 6 }, { x: 25, y: 1.7, z: -6 }
    ],
    buyZoneT: { x: -25, z: 0, radius: 8 },
    buyZoneCT: { x: 25, z: 0, radius: 8 }
  },
  'MS_DUST': {
    maxPlayers: 16,
    spawnT: [
      { x: -45, y: 1.7, z: -45 }, { x: -43, y: 1.7, z: -47 },
      { x: -47, y: 1.7, z: -43 }, { x: -41, y: 1.7, z: -45 },
      { x: -45, y: 1.7, z: -41 }, { x: -49, y: 1.7, z: -45 },
      { x: -43, y: 1.7, z: -43 }, { x: -47, y: 1.7, z: -47 }
    ],
    spawnCT: [
      { x: 45, y: 1.7, z: 45 }, { x: 43, y: 1.7, z: 47 },
      { x: 47, y: 1.7, z: 43 }, { x: 41, y: 1.7, z: 45 },
      { x: 45, y: 1.7, z: 41 }, { x: 49, y: 1.7, z: 45 },
      { x: 43, y: 1.7, z: 43 }, { x: 47, y: 1.7, z: 47 }
    ],
    buyZoneT: { x: -45, z: -45, radius: 10 },
    buyZoneCT: { x: 45, z: 45, radius: 10 }
  },
  'MS_ARENA_BETA': {
    maxPlayers: 10,
    baseSize: 30,
    expandPerPlayer: 5,
    spawnT: [
      { x: -12, y: 1.7, z: 0 }, { x: -14, y: 1.7, z: 3 },
      { x: -14, y: 1.7, z: -3 }, { x: -10, y: 1.7, z: 3 },
      { x: -10, y: 1.7, z: -3 }
    ],
    spawnCT: [
      { x: 12, y: 1.7, z: 0 }, { x: 14, y: 1.7, z: 3 },
      { x: 14, y: 1.7, z: -3 }, { x: 10, y: 1.7, z: 3 },
      { x: 10, y: 1.7, z: -3 }
    ],
    buyZoneT: { x: -15, z: 0, radius: 6 },
    buyZoneCT: { x: 15, z: 0, radius: 6 }
  }
};

// ═══════════════════════════════════════════
// ANTICHEAT
// ═══════════════════════════════════════════

const ANTICHEAT = { MAX_SPEED: 25, MAX_TELEPORT: 20, MAX_FIRE_RATE: 40 };

function anticheatCheck(client, room, data) {
  const player = room.players[client.id];
  if (!player) return { valid: true };
  const now = Date.now();
  if (!player.ac) {
    player.ac = { lastPos: { x: player.x, y: player.y, z: player.z }, lastPosTime: now, lastShot: 0, violations: 0 };
  }
  const ac = player.ac;
  if (data.type === 'move') {
    const dx = data.x - ac.lastPos.x, dy = data.y - ac.lastPos.y, dz = data.z - ac.lastPos.z;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    const dt = (now - ac.lastPosTime) / 1000;
    if (dist > ANTICHEAT.MAX_TELEPORT) {
      ac.violations++;
      if (ac.violations > 5) return { valid: false, reason: 'Teleport detected', kick: true };
      return { valid: false, reason: 'Invalid position' };
    }
    if (dt > 0.01) {
      const speed = dist / dt;
      if (speed > ANTICHEAT.MAX_SPEED) { ac.violations++; if (ac.violations > 10) return { valid: false, reason: 'Speed hack', kick: true }; }
    }
    ac.lastPos = { x: data.x, y: data.y, z: data.z };
    ac.lastPosTime = now;
  }
  if (data.type === 'shoot') {
    const timeSince = now - ac.lastShot;
    if (timeSince < ANTICHEAT.MAX_FIRE_RATE && data.weapon !== 'rpg') { ac.violations++; return { valid: false, reason: 'Fire rate' }; }
    ac.lastShot = now;
  }
  return { valid: true };
}

// ═══════════════════════════════════════════
// HTTP SERVER
// ═══════════════════════════════════════════

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) { res.writeHead(500); res.end('Error'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else if (req.url === '/api/rooms') {
    const list = Object.values(rooms).map(r => ({
      id: r.id, name: r.name, map: r.map, mode: r.mode,
      players: Object.keys(r.players).length, maxPlayers: r.maxPlayers, hasPassword: !!r.password
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(list));
  } else { res.writeHead(404); res.end('Not Found'); }
});

// ═══════════════════════════════════════════
// WEBSOCKET
// ═══════════════════════════════════════════

const wss = new WebSocket.Server({ server });

console.log('═══════════════════════════════════════');
console.log('  MAXIS STRIKE Server v5.1');
console.log('  Port:', PORT);
console.log('═══════════════════════════════════════');

wss.on('connection', (ws) => {
  const clientId = nextPlayerId++;
  const clientData = {
    id: clientId, roomId: null, name: 'Player' + clientId,
    achievements: [], stats: { kills: 0, deaths: 0, headshots: 0, killStreak: 0, wallsDestroyed: 0 }
  };
  clients.set(ws, clientData);
  console.log(`Client ${clientId} connected. Total: ${clients.size}`);

  ws.send(JSON.stringify({ type: 'welcome', id: clientId, achievements: Object.values(achievements), weaponPrices: WEAPON_PRICES }));

  ws.on('message', (raw) => {
    let data; try { data = JSON.parse(raw); } catch(e) { return; }
    const client = clients.get(ws);
    if (!client) return;
    handleMessage(ws, client, data);
  });

  ws.on('close', () => {
    const client = clients.get(ws);
    if (client) { leaveRoom(ws, client); console.log(`Client ${client.id} disconnected.`); }
    clients.delete(ws);
  });

  ws.on('error', (err) => console.log('WS error:', err.message));
});

// ═══════════════════════════════════════════
// MESSAGE HANDLER
// ═══════════════════════════════════════════

function handleMessage(ws, client, data) {
  if (client.roomId && rooms[client.roomId]) {
    const room = rooms[client.roomId];
    if (data.type === 'move' || data.type === 'shoot') {
      const ac = anticheatCheck(client, room, data);
      if (!ac.valid) {
        if (ac.kick) { ws.send(JSON.stringify({ type: 'kicked', reason: ac.reason })); ws.close(); }
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
      if (client.roomId && rooms[client.roomId] && rooms[client.roomId].players[client.id]) {
        rooms[client.roomId].players[client.id].name = client.name;
        broadcastToRoom(client.roomId, { type: 'nameChange', id: client.id, name: client.name });
      }
      break;
    case 'move': handleMove(ws, client, data); break;
    case 'shoot': handleShoot(ws, client, data); break;
    case 'switchWeapon': handleWeaponSwitch(ws, client, data); break;
    case 'buyWeapon': handleBuyWeapon(ws, client, data); break;
    case 'chat': handleChat(ws, client, data); break;
    case 'rpgExplode': handleRPGExplosion(ws, client, data); break;
    case 'destroyWall': handleDestroyWall(ws, client, data); break;
  }
}

// ═══════════════════════════════════════════
// ROOMS
// ═══════════════════════════════════════════

function sendRoomList(ws) {
  const list = Object.values(rooms).map(r => ({
    id: r.id, name: r.name, map: r.map, mode: r.mode,
    players: Object.keys(r.players).length, maxPlayers: r.maxPlayers, hasPassword: !!r.password
  }));
  ws.send(JSON.stringify({ type: 'roomList', rooms: list }));
}

function createRoom(ws, client, data) {
  const roomId = nextRoomId++;
  const mapCfg = MAP_CONFIGS[data.map] || MAP_CONFIGS['MS_START'];

  const room = {
    id: roomId, name: (data.name || 'Server').substring(0, 24),
    password: data.password || '', map: data.map || 'MS_START',
    mode: data.mode || 'deathmatch', maxPlayers: mapCfg.maxPlayers,
    players: {}, destructibleWalls: [], physicsObjects: [],
    scores: { T: 0, CT: 0 }, firstBloodTaken: false,
    mapSize: mapCfg.baseSize || 50
  };

  if (data.map === 'MS_ARENA_BETA') {
    room.destructibleWalls = generateWalls(room.mapSize);
    room.physicsObjects = generatePhysics(room.mapSize);
  }

  rooms[roomId] = room;
  console.log(`Room ${roomId}: "${room.name}" [${room.map}] [${room.mode}]`);
  joinRoom(ws, client, { roomId, password: data.password });
  broadcastRoomList();
}

function generateWalls(size) {
  const walls = [];
  let id = 1;
  // Ring of destructible walls
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const dist = size * 0.45;
    walls.push({
      id: id++, x: Math.cos(angle) * dist, y: 2, z: Math.sin(angle) * dist,
      width: 4, height: 4, depth: 0.5, hp: 100, destroyed: false
    });
  }
  // Cross walls in center area
  walls.push({ id: id++, x: 0, y: 2, z: -8, width: 5, height: 4, depth: 0.5, hp: 100, destroyed: false });
  walls.push({ id: id++, x: 0, y: 2, z: 8, width: 5, height: 4, depth: 0.5, hp: 100, destroyed: false });
  walls.push({ id: id++, x: -8, y: 2, z: 0, width: 0.5, height: 4, depth: 5, hp: 100, destroyed: false });
  walls.push({ id: id++, x: 8, y: 2, z: 0, width: 0.5, height: 4, depth: 5, hp: 100, destroyed: false });
  return walls;
}

function generatePhysics(size) {
  const objects = [];
  let id = 1;
  // Few barrels — NOT too many
  const barrelPositions = [
    { x: -6, z: -6 }, { x: 6, z: 6 }, { x: -6, z: 6 }, { x: 6, z: -6 },
    { x: 0, z: -15 }, { x: 0, z: 15 }
  ];
  for (const pos of barrelPositions) {
    objects.push({
      id: id++, type: 'barrel', x: pos.x, y: 0.6, z: pos.z,
      vx: 0, vy: 0, vz: 0, radius: 0.5, mass: 50, destroyed: false
    });
  }
  // Few crates
  const cratePositions = [
    { x: -12, z: -8 }, { x: 12, z: 8 }, { x: -12, z: 8 }, { x: 12, z: -8 }
  ];
  for (const pos of cratePositions) {
    objects.push({
      id: id++, type: 'crate', x: pos.x, y: 0.75, z: pos.z,
      vx: 0, vy: 0, vz: 0, size: 1.5, mass: 80, destroyed: false
    });
  }
  return objects;
}

function joinRoom(ws, client, data) {
  const room = rooms[data.roomId];
  if (!room) { ws.send(JSON.stringify({ type: 'joinError', error: 'Room not found' })); return; }
  if (room.password && room.password !== data.password) { ws.send(JSON.stringify({ type: 'joinError', error: 'Wrong password' })); return; }
  if (Object.keys(room.players).length >= room.maxPlayers) { ws.send(JSON.stringify({ type: 'joinError', error: 'Room full' })); return; }

  if (client.roomId) leaveRoom(ws, client);

  const tCount = Object.values(room.players).filter(p => p.team === 'T').length;
  const ctCount = Object.values(room.players).filter(p => p.team === 'CT').length;
  const team = tCount <= ctCount ? 'T' : 'CT';

  const mapCfg = MAP_CONFIGS[room.map];
  const spawns = team === 'T' ? mapCfg.spawnT : mapCfg.spawnCT;
  const spawnIdx = Object.values(room.players).filter(p => p.team === team).length % spawns.length;
  const spawn = spawns[spawnIdx];

  if (room.map === 'MS_ARENA_BETA') {
    const pc = Object.keys(room.players).length + 1;
    room.mapSize = mapCfg.baseSize + (pc * mapCfg.expandPerPlayer);
    broadcastToRoom(room.id, { type: 'mapResize', size: room.mapSize });
  }

  const player = {
    id: client.id, name: client.name, team,
    x: spawn.x, y: spawn.y, z: spawn.z,
    rx: 0, ry: team === 'T' ? 0 : Math.PI,
    hp: 100, money: 800, kills: 0, deaths: 0,
    alive: true, weapon: 'knife', weapons: ['knife'], killStreak: 0
  };

  room.players[client.id] = player;
  client.roomId = room.id;
  client.stats = { kills: 0, deaths: 0, headshots: 0, killStreak: 0, wallsDestroyed: 0 };

  console.log(`Player ${client.id} (${client.name}) -> room ${room.id} [${team}]`);

  ws.send(JSON.stringify({
    type: 'joinedRoom', roomId: room.id, roomName: room.name, map: room.map, mode: room.mode,
    player, players: room.players,
    destructibleWalls: room.destructibleWalls, physicsObjects: room.physicsObjects,
    scores: room.scores, mapSize: room.mapSize, weaponPrices: WEAPON_PRICES
  }));

  broadcastToRoom(room.id, { type: 'playerJoin', player }, client.id);
  broadcastRoomList();
}

function leaveRoom(ws, client) {
  if (!client.roomId) return;
  const room = rooms[client.roomId];
  if (!room) { client.roomId = null; return; }

  broadcastToRoom(room.id, { type: 'playerLeave', id: client.id }, client.id);
  delete room.players[client.id];
  client.roomId = null;

  if (room.map === 'MS_ARENA_BETA') {
    const mapCfg = MAP_CONFIGS[room.map];
    const pc = Object.keys(room.players).length;
    room.mapSize = mapCfg.baseSize + (pc * mapCfg.expandPerPlayer);
    broadcastToRoom(room.id, { type: 'mapResize', size: room.mapSize });
  }

  if (Object.keys(room.players).length === 0) {
    delete rooms[room.id];
    console.log(`Room ${room.id} deleted`);
  }
  broadcastRoomList();
}

// ═══════════════════════════════════════════
// GAME LOGIC
// ═══════════════════════════════════════════

function handleMove(ws, client, data) {
  const room = rooms[client.roomId];
  if (!room || !room.players[client.id]) return;
  const p = room.players[client.id];
  p.x = data.x; p.y = data.y; p.z = data.z; p.rx = data.rx; p.ry = data.ry;
  broadcastToRoom(room.id, { type: 'playerMove', id: client.id, x: data.x, y: data.y, z: data.z, rx: data.rx, ry: data.ry }, client.id);
}

function handleShoot(ws, client, data) {
  const room = rooms[client.roomId];
  if (!room || !room.players[client.id]) return;
  const shooter = room.players[client.id];
  if (!shooter.alive) return;
  const weapon = data.weapon;
  const damage = WEAPON_DAMAGE[weapon] || 25;

  broadcastToRoom(room.id, {
    type: 'playerShoot', id: client.id, x: data.x, y: data.y, z: data.z,
    dx: data.dx, dy: data.dy, dz: data.dz, weapon
  }, client.id);

  if (weapon === 'rpg') return;

  for (let pid in room.players) {
    if (pid == client.id) continue;
    const target = room.players[pid];
    if (!target.alive) continue;
    if (shooter.team === target.team && room.mode !== 'ffa') continue;

    const dist = checkRayHit(data.x, data.y, data.z, data.dx, data.dy, data.dz, target.x, target.y, target.z, 0.8);
    if (dist !== null && dist < 100) {
      const headshot = Math.abs((data.y + data.dy * dist) - (target.y + 0.5)) < 0.3;
      const finalDmg = headshot ? damage * 3 : damage;
      target.hp -= finalDmg;

      if (target.hp <= 0) {
        handleKill(room, client, shooter, target, parseInt(pid), weapon, headshot);
      } else {
        sendToPlayer(parseInt(pid), { type: 'hit', hp: target.hp, attackerId: client.id, fromX: shooter.x, fromZ: shooter.z });
        sendToPlayer(client.id, { type: 'hitConfirm', targetId: parseInt(pid), hp: target.hp, headshot });
      }
      break;
    }
  }
}

function handleKill(room, client, shooter, target, targetId, weapon, headshot) {
  target.hp = 0; target.alive = false; target.deaths++;
  shooter.kills++; shooter.killStreak++;
  shooter.money += 500;
  client.stats.kills++;
  if (headshot) client.stats.headshots++;
  target.money = Math.max(0, target.money - 200);

  const targetClient = getClientByPlayerId(targetId);
  if (targetClient) { targetClient.stats.killStreak = 0; targetClient.stats.deaths++; }

  const killCamData = {
    killerId: client.id, killerName: shooter.name,
    killerPos: { x: shooter.x, y: shooter.y, z: shooter.z },
    victimPos: { x: target.x, y: target.y, z: target.z },
    weapon, headshot
  };

  broadcastToRoom(room.id, {
    type: 'kill', killerId: client.id, victimId: targetId,
    weapon, headshot, killCam: killCamData,
    killerMoney: shooter.money, victimMoney: target.money
  });

  if (room.mode === 'deathmatch') room.scores[shooter.team]++;

  // Achievements
  if (!room.firstBloodTaken) {
    room.firstBloodTaken = true;
    if (!client.achievements.includes('FIRST_BLOOD')) {
      client.achievements.push('FIRST_BLOOD');
      sendToPlayerWS(client.id, { type: 'newAchievements', achievements: [achievements.FIRST_BLOOD] });
    }
  }
  if (weapon === 'knife' && !client.achievements.includes('KNIFE_MASTER')) {
    client.achievements.push('KNIFE_MASTER');
    sendToPlayerWS(client.id, { type: 'newAchievements', achievements: [achievements.KNIFE_MASTER] });
  }
  if (client.stats.headshots >= 10 && !client.achievements.includes('HEADHUNTER')) {
    client.achievements.push('HEADHUNTER');
    sendToPlayerWS(client.id, { type: 'newAchievements', achievements: [achievements.HEADHUNTER] });
  }
  if (shooter.killStreak >= 5 && !client.achievements.includes('RAMPAGE')) {
    client.achievements.push('RAMPAGE');
    sendToPlayerWS(client.id, { type: 'newAchievements', achievements: [achievements.RAMPAGE] });
  }

  setTimeout(() => respawnPlayer(room, targetId), 3000);
}

function handleRPGExplosion(ws, client, data) {
  const room = rooms[client.roomId];
  if (!room) return;
  const shooter = room.players[client.id];
  if (!shooter) return;

  const explosionRadius = 8, explosionDamage = 150;

  for (let pid in room.players) {
    const target = room.players[pid];
    if (!target.alive) continue;
    if (shooter.team === target.team && room.mode !== 'ffa' && pid != client.id) continue;

    const dx = target.x - data.x, dy = target.y - data.y, dz = target.z - data.z;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (dist < explosionRadius) {
      const falloff = 1 - (dist / explosionRadius);
      const damage = Math.floor(explosionDamage * falloff);
      target.hp -= damage;
      if (target.hp <= 0 && pid != client.id) {
        handleKill(room, client, shooter, target, parseInt(pid), 'rpg', false);
        broadcastToRoom(room.id, { type: 'gibEffect', x: target.x, y: target.y, z: target.z });
      } else if (target.hp > 0) {
        sendToPlayer(parseInt(pid), { type: 'hit', hp: target.hp, attackerId: client.id });
      }
    }
  }

  // Push physics objects
  for (const obj of room.physicsObjects) {
    if (obj.destroyed) continue;
    const dx = obj.x - data.x, dz = obj.z - data.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist < explosionRadius && dist > 0) {
      const force = (1 - dist / explosionRadius) * 20;
      obj.vx = (dx / dist) * force;
      obj.vy = 5;
      obj.vz = (dz / dist) * force;
      if (obj.type === 'barrel' && dist < 3) {
        obj.destroyed = true;
        broadcastToRoom(room.id, { type: 'objectDestroyed', id: obj.id, x: obj.x, y: obj.y, z: obj.z, debrisCount: 8 });
      }
    }
  }

  broadcastToRoom(room.id, { type: 'physicsUpdate', objects: room.physicsObjects.filter(o => !o.destroyed) });
  broadcastToRoom(room.id, { type: 'explosion', x: data.x, y: data.y, z: data.z, radius: explosionRadius });
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
    broadcastToRoom(room.id, { type: 'wallDestroyed', wallId: wall.id, debris: [] });
    if (client.stats.wallsDestroyed >= 10 && !client.achievements.includes('DEMOLITION')) {
      client.achievements.push('DEMOLITION');
      ws.send(JSON.stringify({ type: 'newAchievements', achievements: [achievements.DEMOLITION] }));
    }
  } else {
    broadcastToRoom(room.id, { type: 'wallDamaged', wallId: wall.id, hp: wall.hp });
  }
}

function handleBuyWeapon(ws, client, data) {
  const room = rooms[client.roomId];
  if (!room || !room.players[client.id]) return;
  const player = room.players[client.id];
  if (!player.alive) return;

  const weapon = data.weapon;
  const price = WEAPON_PRICES[weapon];
  if (price === undefined) { ws.send(JSON.stringify({ type: 'buyError', error: 'Unknown weapon' })); return; }
  if (player.weapons.includes(weapon)) { ws.send(JSON.stringify({ type: 'buyError', error: 'Already owned' })); return; }

  const mapCfg = MAP_CONFIGS[room.map];
  const buyZone = player.team === 'T' ? mapCfg.buyZoneT : mapCfg.buyZoneCT;
  const dx = player.x - buyZone.x, dz = player.z - buyZone.z;
  if (Math.sqrt(dx*dx + dz*dz) > buyZone.radius) { ws.send(JSON.stringify({ type: 'buyError', error: 'Not in buy zone!' })); return; }
  if (player.money < price) { ws.send(JSON.stringify({ type: 'buyError', error: 'Not enough money!' })); return; }

  player.money -= price;
  player.weapons.push(weapon);
  player.weapon = weapon;

  ws.send(JSON.stringify({ type: 'weaponBought', weapon, money: player.money, weapons: player.weapons }));
  broadcastToRoom(room.id, { type: 'weaponSwitch', id: client.id, weapon }, client.id);

  if (player.money >= 10000 && !client.achievements.includes('RICH')) {
    client.achievements.push('RICH');
    ws.send(JSON.stringify({ type: 'newAchievements', achievements: [achievements.RICH] }));
  }
}

function handleWeaponSwitch(ws, client, data) {
  const room = rooms[client.roomId];
  if (!room || !room.players[client.id]) return;
  const player = room.players[client.id];
  if (!player.weapons.includes(data.weapon)) { ws.send(JSON.stringify({ type: 'switchError', error: 'Not owned' })); return; }
  player.weapon = data.weapon;
  broadcastToRoom(room.id, { type: 'weaponSwitch', id: client.id, weapon: data.weapon }, client.id);
}

function handleChat(ws, client, data) {
  const room = rooms[client.roomId];
  if (!room) return;
  broadcastToRoom(room.id, { type: 'chat', id: client.id, name: client.name, msg: (data.msg || '').substring(0, 100) });
}

function respawnPlayer(room, playerId) {
  if (!room || !room.players[playerId]) return;
  const player = room.players[playerId];
  const mapCfg = MAP_CONFIGS[room.map];
  const spawns = player.team === 'T' ? mapCfg.spawnT : mapCfg.spawnCT;
  const spawn = spawns[Math.floor(Math.random() * spawns.length)];

  player.hp = 100; player.alive = true;
  player.x = spawn.x; player.y = spawn.y; player.z = spawn.z;
  player.killStreak = 0; player.weapon = 'knife'; player.weapons = ['knife'];

  broadcastToRoom(room.id, { type: 'respawn', id: playerId, x: spawn.x, y: spawn.y, z: spawn.z, money: player.money });
}

// ═══════════════════════════════════════════
// UTILS
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

function getClientByPlayerId(id) {
  for (const [ws, c] of clients.entries()) { if (c.id === id) return c; }
  return null;
}

function broadcastToRoom(roomId, data, excludeId) {
  const msg = JSON.stringify(data);
  for (const [ws, c] of clients.entries()) {
    if (c.roomId === roomId && c.id !== excludeId && ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

function sendToPlayer(playerId, data) {
  const msg = JSON.stringify(data);
  for (const [ws, c] of clients.entries()) {
    if (c.id === playerId && ws.readyState === WebSocket.OPEN) { ws.send(msg); break; }
  }
}

function sendToPlayerWS(playerId, data) {
  const msg = JSON.stringify(data);
  for (const [ws, c] of clients.entries()) {
    if (c.id === playerId && ws.readyState === WebSocket.OPEN) { ws.send(msg); break; }
  }
}

function broadcastRoomList() {
  const list = Object.values(rooms).map(r => ({
    id: r.id, name: r.name, map: r.map, mode: r.mode,
    players: Object.keys(r.players).length, maxPlayers: r.maxPlayers, hasPassword: !!r.password
  }));
  const msg = JSON.stringify({ type: 'roomList', rooms: list });
  for (const [ws, c] of clients.entries()) {
    if (!c.roomId && ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

// ═══════════════════════════════════════════
// PHYSICS LOOP
// ═══════════════════════════════════════════

setInterval(() => {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (!room.physicsObjects) continue;
    let changed = false;
    for (const obj of room.physicsObjects) {
      if (obj.destroyed) continue;
      if (Math.abs(obj.vx) > 0.01 || Math.abs(obj.vy) > 0.01 || Math.abs(obj.vz) > 0.01) {
        obj.x += obj.vx * 0.05;
        obj.y += obj.vy * 0.05;
        obj.z += obj.vz * 0.05;
        obj.vy -= 0.5;
        const groundY = obj.type === 'barrel' ? 0.6 : 0.75;
        if (obj.y < groundY) { obj.y = groundY; obj.vy = -obj.vy * 0.3; obj.vx *= 0.8; obj.vz *= 0.8; }
        obj.vx *= 0.95; obj.vz *= 0.95;
        changed = true;
      }
    }
    if (changed) {
      broadcastToRoom(roomId, { type: 'physicsUpdate', objects: room.physicsObjects.filter(o => !o.destroyed) });
    }
  }
}, 50);

// State sync
setInterval(() => {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (Object.keys(room.players).length > 0) {
      broadcastToRoom(roomId, { type: 'state', players: room.players, scores: room.scores });
    }
  }
}, 50);

// Ping
setInterval(() => { wss.clients.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.ping(); }); }, 30000);

// ═══════════════════════════════════════════
// START
// ═══════════════════════════════════════════

server.listen(PORT, () => {
  console.log(`Server on port ${PORT}`);
  console.log(`Open http://localhost:${PORT}`);
});
