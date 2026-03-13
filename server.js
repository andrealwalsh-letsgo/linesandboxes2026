const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const crypto = require('crypto');

// In-memory game rooms
const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? generateCode() : code;
}

function createRoom(width, height, hostName) {
  const code = generateCode();
  const room = {
    code,
    width: Math.min(Math.max(width, 2), 1000),
    height: Math.min(Math.max(height, 2), 1000),
    players: [],
    // horizontal lines: [row][col] — rows 0..height, cols 0..width-1
    hLines: Array.from({ length: height + 1 }, () => new Array(width).fill(null)),
    // vertical lines: [row][col] — rows 0..height-1, cols 0..width+1
    vLines: Array.from({ length: height }, () => new Array(width + 1).fill(null)),
    // boxes: [row][col] — rows 0..height-1, cols 0..width-1
    boxes: Array.from({ length: height }, () => new Array(width).fill(null)),
    currentPlayerIndex: 0,
    started: false,
    finished: false,
  };
  rooms.set(code, room);
  return room;
}

function addPlayer(room, name, socketId) {
  if (room.players.length >= 100) return null;
  if (room.started) return null;
  const player = {
    id: socketId,
    playerId: crypto.randomBytes(8).toString('hex'),
    name,
    color: playerColors[room.players.length % playerColors.length],
    score: 0,
  };
  room.players.push(player);
  return player;
}

const playerColors = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#e91e63', '#00bcd4', '#8bc34a',
  '#ff5722', '#607d8b', '#795548', '#cddc39', '#ff9800',
  '#4caf50', '#2196f3', '#f44336', '#9c27b0', '#00897b',
];

function checkBoxes(room, playerIndex) {
  let completed = 0;
  const w = room.width;
  const h = room.height;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (room.boxes[r][c] === null) {
        const top = room.hLines[r][c];
        const bottom = room.hLines[r + 1][c];
        const left = room.vLines[r][c];
        const right = room.vLines[r][c + 1];
        if (top !== null && bottom !== null && left !== null && right !== null) {
          room.boxes[r][c] = playerIndex;
          room.players[playerIndex].score++;
          completed++;
        }
      }
    }
  }
  return completed;
}

function isGameOver(room) {
  const totalBoxes = room.width * room.height;
  let filled = 0;
  for (let r = 0; r < room.height; r++) {
    for (let c = 0; c < room.width; c++) {
      if (room.boxes[r][c] !== null) filled++;
    }
  }
  return filled === totalBoxes;
}

function getRoomState(room) {
  return {
    code: room.code,
    width: room.width,
    height: room.height,
    players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color, score: p.score, kicked: !!p.kicked })),
    hLines: room.hLines,
    vLines: room.vLines,
    boxes: room.boxes,
    currentPlayerIndex: room.currentPlayerIndex,
    started: room.started,
    finished: room.finished,
  };
}

// For large grids, send a sparse representation
function getSparseRoomState(room) {
  const state = {
    code: room.code,
    width: room.width,
    height: room.height,
    players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color, score: p.score, kicked: !!p.kicked })),
    currentPlayerIndex: room.currentPlayerIndex,
    started: room.started,
    finished: room.finished,
    // Only send filled lines and boxes
    filledHLines: [],
    filledVLines: [],
    filledBoxes: [],
  };
  for (let r = 0; r <= room.height; r++) {
    for (let c = 0; c < room.width; c++) {
      if (room.hLines[r][c] !== null) state.filledHLines.push([r, c, room.hLines[r][c]]);
    }
  }
  for (let r = 0; r < room.height; r++) {
    for (let c = 0; c <= room.width; c++) {
      if (room.vLines[r][c] !== null) state.filledVLines.push([r, c, room.vLines[r][c]]);
    }
  }
  for (let r = 0; r < room.height; r++) {
    for (let c = 0; c < room.width; c++) {
      if (room.boxes[r][c] !== null) state.filledBoxes.push([r, c, room.boxes[r][c]]);
    }
  }
  return state;
}

function isSparse(room) {
  return room.width * room.height > 400; // Use sparse for grids larger than 20x20
}

function advanceTurn(room) {
  const n = room.players.length;
  let next = (room.currentPlayerIndex + 1) % n;
  let attempts = 0;
  while (room.players[next].kicked && attempts < n) {
    next = (next + 1) % n;
    attempts++;
  }
  room.currentPlayerIndex = next;
}

function emitState(room) {
  const state = isSparse(room) ? getSparseRoomState(room) : getRoomState(room);
  io.to(room.code).emit('gameState', state);
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let currentPlayerIndex = -1;

  socket.on('createRoom', ({ name, width, height }, cb) => {
    const room = createRoom(width, height, name);
    const player = addPlayer(room, name, socket.id);
    if (!player) return cb({ error: 'Could not create room' });
    currentRoom = room;
    currentPlayerIndex = 0;
    socket.join(room.code);
    cb({ code: room.code, playerIndex: 0, playerId: player.playerId });
    emitState(room);
  });

  socket.on('joinRoom', ({ code, name }, cb) => {
    const room = rooms.get(code.toUpperCase());
    if (!room) return cb({ error: 'Room not found' });
    if (room.started) return cb({ error: 'Game already started' });
    if (room.players.length >= 100) return cb({ error: 'Room is full' });
    const player = addPlayer(room, name, socket.id);
    if (!player) return cb({ error: 'Could not join' });
    currentRoom = room;
    currentPlayerIndex = room.players.length - 1;
    socket.join(room.code);
    cb({ code: room.code, playerIndex: currentPlayerIndex, playerId: player.playerId });
    emitState(room);
  });

  socket.on('rejoinRoom', ({ code, playerId }, cb) => {
    const room = rooms.get(code.toUpperCase());
    if (!room) return cb({ error: 'Room not found' });
    const idx = room.players.findIndex(p => p.playerId === playerId && !p.kicked);
    if (idx === -1) return cb({ error: 'Could not rejoin — player not found' });
    // Swap socket ID
    room.players[idx].id = socket.id;
    currentRoom = room;
    currentPlayerIndex = idx;
    socket.join(room.code);
    cb({ code: room.code, playerIndex: idx, playerId, isHost: idx === 0 });
    emitState(room);
  });

  socket.on('startGame', () => {
    if (!currentRoom || currentPlayerIndex !== 0) return;
    if (currentRoom.players.length < 1) return;
    currentRoom.started = true;
    emitState(currentRoom);
  });

  socket.on('kickPlayer', ({ playerIndex }, cb) => {
    const room = currentRoom;
    if (!room || currentPlayerIndex !== 0) return; // Only host (index 0) can kick
    if (playerIndex <= 0 || playerIndex >= room.players.length) return; // Can't kick self or invalid

    const kicked = room.players[playerIndex];
    kicked.kicked = true;

    // Notify the kicked player
    io.to(kicked.id).emit('kicked', { message: 'The host has removed you from the game. Thanks for playing!' });

    // If it was the kicked player's turn, advance to next active player
    if (room.started && room.currentPlayerIndex === playerIndex) {
      advanceTurn(room);
    }

    // Update all connected player indices for players after the kicked one
    // We keep the player in the array (to preserve lines/scores) but mark them kicked
    emitState(room);
    if (cb) cb({ ok: true });
  });

  socket.on('placeLine', ({ type, row, col }) => {
    const room = currentRoom;
    if (!room || !room.started || room.finished) return;
    if (room.currentPlayerIndex !== currentPlayerIndex) return;
    if (room.players[currentPlayerIndex].kicked) return;

    // Validate
    row = parseInt(row); col = parseInt(col);
    if (isNaN(row) || isNaN(col)) return;

    if (type === 'h') {
      if (row < 0 || row > room.height || col < 0 || col >= room.width) return;
      if (room.hLines[row][col] !== null) return;
      room.hLines[row][col] = currentPlayerIndex;
    } else if (type === 'v') {
      if (row < 0 || row >= room.height || col < 0 || col > room.width) return;
      if (room.vLines[row][col] !== null) return;
      room.vLines[row][col] = currentPlayerIndex;
    } else return;

    const boxesCompleted = checkBoxes(room, currentPlayerIndex);

    if (isGameOver(room)) {
      room.finished = true;
    } else if (boxesCompleted === 0) {
      // Next player's turn (skip kicked players)
      advanceTurn(room);
    }
    // If boxes were completed, same player goes again

    // Emit the move to all players (efficient for large grids)
    io.to(room.code).emit('move', {
      type, row, col,
      playerIndex: currentPlayerIndex,
      boxesCompleted,
      currentPlayerIndex: room.currentPlayerIndex,
      players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color, score: p.score, kicked: !!p.kicked })),
      finished: room.finished,
    });
  });

  socket.on('disconnect', () => {
    // Don't remove players mid-game, just note disconnection
    if (currentRoom && !currentRoom.started) {
      const idx = currentRoom.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        currentRoom.players.splice(idx, 1);
        // Re-index remaining players
        if (currentRoom.players.length === 0) {
          rooms.delete(currentRoom.code);
        } else {
          emitState(currentRoom);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
