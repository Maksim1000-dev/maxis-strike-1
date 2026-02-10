// MAXIS STRIKE Server for Render.com
// HTTP + WebSocket on single port

const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;

// Create HTTP server to serve index.html
const server = http.createServer((req, res) => {
  console.log('HTTP Request:', req.url);
  
  // Serve index.html for root
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
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// Attach WebSocket server
const wss = new WebSocket.Server({ server });

console.log('=================================');
console.log('  MAXIS STRIKE Server v2.0');
console.log('  Port:', PORT);
console.log('  Ready for Render.com!');
console.log('=================================');

const players = {};
let nextId = 1;

const SPAWN_POINTS = [
  { x: -20, y: 1.5, z: -20 },
  { x: 20, y: 1.5, z: -20 },
  { x: -20, y: 1.5, z: 20 },
  { x: 20, y: 1.5, z: 20 },
  { x: 0, y: 1.5, z: 0 },
  { x: 10, y: 1.5, z: -10 },
  { x: -10, y: 1.5, z: 10 },
  { x: 15, y: 1.5, z: 15 },
];

function getSpawn() {
  return SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
}

function broadcast(data, excludeId) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.playerId !== excludeId) {
      client.send(msg);
    }
  });
}

function sendTo(id, data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.playerId === id) {
      client.send(JSON.stringify(data));
    }
  });
}

wss.on('connection', (ws) => {
  const id = nextId++;
  ws.playerId = id;
  const spawn = getSpawn();

  players[id] = {
    id,
    name: 'Player ' + id,
    x: spawn.x, y: spawn.y, z: spawn.z,
    rx: 0, ry: 0,
    hp: 100,
    deaths: 0,
    kills: 0,
    team: id % 2 === 0 ? 'CT' : 'T',
    weapon: 'ak47',
    alive: true
  };

  console.log(`Player ${id} connected. Total: ${Object.keys(players).length}`);

  // Send init
  ws.send(JSON.stringify({
    type: 'init',
    id: id,
    player: players[id],
    players: players
  }));

  // Broadcast join
  broadcast({ type: 'playerJoin', player: players[id] }, id);

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch(e) { return; }

    if (!players[id]) return;

    switch(data.type) {
      case 'move':
        players[id].x = data.x;
        players[id].y = data.y;
        players[id].z = data.z;
        players[id].rx = data.rx;
        players[id].ry = data.ry;
        broadcast({ type: 'playerMove', id, x: data.x, y: data.y, z: data.z, rx: data.rx, ry: data.ry }, id);
        break;

      case 'shoot':
        broadcast({ type: 'playerShoot', id, x: data.x, y: data.y, z: data.z, dx: data.dx, dy: data.dy, dz: data.dz }, id);
        // Server-side hit detection
        for (let pid in players) {
          if (pid == id || !players[pid].alive) continue;
          const p = players[pid];
          const dist = checkRayHit(
            data.x, data.y, data.z,
            data.dx, data.dy, data.dz,
            p.x, p.y, p.z, 0.8
          );
          if (dist !== null && dist < 100) {
            const dmg = data.weapon === 'ak47' ? 27 : data.weapon === 'deagle' ? 45 : 55;
            const headshot = Math.abs((data.y + data.dy * dist) - (p.y + 0.5)) < 0.3;
            const finalDmg = headshot ? dmg * 3 : dmg;
            players[pid].hp -= finalDmg;

            if (players[pid].hp <= 0) {
              players[pid].hp = 0;
              players[pid].alive = false;
              players[pid].deaths++;
              players[id].kills++;

              broadcast({ type: 'kill', killerId: parseInt(id), victimId: parseInt(pid), weapon: data.weapon, headshot }, undefined);
              sendTo(parseInt(pid), { type: 'kill', killerId: parseInt(id), victimId: parseInt(pid), weapon: data.weapon, headshot });

              // Respawn after 3s
              setTimeout(() => {
                if (players[pid]) {
                  const sp = getSpawn();
                  players[pid].hp = 100;
                  players[pid].alive = true;
                  players[pid].x = sp.x;
                  players[pid].y = sp.y;
                  players[pid].z = sp.z;
                  broadcast({ type: 'respawn', id: parseInt(pid), x: sp.x, y: sp.y, z: sp.z }, undefined);
                  sendTo(parseInt(pid), { type: 'respawn', id: parseInt(pid), x: sp.x, y: sp.y, z: sp.z });
                }
              }, 3000);
            } else {
              sendTo(parseInt(pid), { type: 'hit', hp: players[pid].hp, attackerId: parseInt(id) });
              sendTo(parseInt(id), { type: 'hitConfirm', targetId: parseInt(pid), hp: players[pid].hp, headshot });
            }
            break;
          }
        }
        break;

      case 'setName':
        players[id].name = (data.name || 'Player').substring(0, 16);
        broadcast({ type: 'nameChange', id, name: players[id].name }, undefined);
        break;

      case 'chat':
        broadcast({ type: 'chat', id, name: players[id].name, msg: (data.msg || '').substring(0, 100) }, undefined);
        break;

      case 'switchWeapon':
        players[id].weapon = data.weapon;
        broadcast({ type: 'weaponSwitch', id, weapon: data.weapon }, id);
        break;
    }
  });

  ws.on('close', () => {
    console.log(`Player ${id} disconnected.`);
    broadcast({ type: 'playerLeave', id }, id);
    delete players[id];
  });

  ws.on('error', (err) => {
    console.log(`Player ${id} error:`, err.message);
  });
});

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

// State sync every 50ms
setInterval(() => {
  if (Object.keys(players).length > 0) {
    wss.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'state', players }));
      }
    });
  }
}, 50);

// Keep-alive ping
setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  });
}, 30000);

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
