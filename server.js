const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

app.use(cors());

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (data) => {
    const { roomId, username } = data;
    
    socket.join(roomId);
    socket.username = username;
    socket.roomId = roomId;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId).add(socket.id);

    const userCount = rooms.get(roomId).size;

    socket.to(roomId).emit('user-joined', { username, userCount });
    socket.emit('room-users', { userCount });
  });

  socket.on('leave-room', (data) => {
    const { roomId } = data;
    handleUserLeave(socket, roomId);
  });

  socket.on('video-play', (data) => {
    socket.to(data.roomId).emit('video-play', data);
  });

  socket.on('video-pause', (data) => {
    socket.to(data.roomId).emit('video-pause', data);
  });

  socket.on('video-seek', (data) => {
    socket.to(data.roomId).emit('video-seek', data);
  });

  socket.on('video-load', (data) => {
    socket.to(data.roomId).emit('video-load', data);
  });

  socket.on('chat-message', (data) => {
    io.to(data.roomId).emit('chat-message', data);
  });

  socket.on('disconnect', () => {
    handleUserLeave(socket, socket.roomId);
    console.log('User disconnected:', socket.id);
  });

  function handleUserLeave(socket, roomId) {
    if (roomId && rooms.has(roomId)) {
      rooms.get(roomId).delete(socket.id);
      const userCount = rooms.get(roomId).size;
      
      if (userCount === 0) {
        rooms.delete(roomId);
      } else {
        socket.to(roomId).emit('user-left', { 
          username: socket.username, 
          userCount 
        });
      }
    }
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
