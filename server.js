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
const typingUsers = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (data) => {
    const { roomId, username, isHost } = data;
    
    socket.join(roomId);
    socket.username = username;
    socket.roomId = roomId;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        users: new Map(),
        host: null,
        currentVideo: null
      });
    }

    const room = rooms.get(roomId);
    
    // Set host if this is the first user or if they claim to be host
    if (!room.host || isHost) {
      room.host = username;
    }

    room.users.set(socket.id, { username, isHost: room.host === username });
    socket.isHost = room.host === username;

    const userCount = room.users.size;

    // Send room state to the joining user
    socket.emit('room-joined', {
      isHost: socket.isHost,
      currentVideo: room.currentVideo
    });

    // Notify others
    socket.to(roomId).emit('user-joined', { username, userCount });
    socket.emit('room-users', { userCount });
  });

  socket.on('leave-room', (data) => {
    const { roomId } = data;
    handleUserLeave(socket, roomId);
  });

  socket.on('video-play', (data) => {
    if (!socket.isHost) return;
    socket.to(data.roomId).emit('video-play', data);
  });

  socket.on('video-pause', (data) => {
    if (!socket.isHost) return;
    socket.to(data.roomId).emit('video-pause', data);
  });

  socket.on('video-seek', (data) => {
    if (!socket.isHost) return;
    socket.to(data.roomId).emit('video-seek', data);
  });

  socket.on('video-load', (data) => {
    if (!socket.isHost) return;
    
    // Store current video in room
    if (rooms.has(data.roomId)) {
      rooms.get(data.roomId).currentVideo = data;
    }
    
    socket.to(data.roomId).emit('video-load', data);
  });

  socket.on('chat-message', (data) => {
    io.to(data.roomId).emit('chat-message', {
      ...data,
      isHost: socket.isHost
    });
  });

  socket.on('typing-start', (data) => {
    if (!typingUsers.has(data.roomId)) {
      typingUsers.set(data.roomId, new Set());
    }
    typingUsers.get(data.roomId).add(data.username);
    
    socket.to(data.roomId).emit('user-typing', data);
  });

  socket.on('typing-stop', (data) => {
    if (typingUsers.has(data.roomId)) {
      typingUsers.get(data.roomId).delete(data.username);
    }
    
    socket.to(data.roomId).emit('user-stopped-typing', data);
  });

  socket.on('disconnect', () => {
    handleUserLeave(socket, socket.roomId);
    console.log('User disconnected:', socket.id);
  });

  function handleUserLeave(socket, roomId) {
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.users.delete(socket.id);
      
      const userCount = room.users.size;
      
      if (userCount === 0) {
        rooms.delete(roomId);
        typingUsers.delete(roomId);
      } else {
        // If the host left, assign new host
        if (room.host === socket.username) {
          const newHostEntry = Array.from(room.users.values())[0];
          room.host = newHostEntry.username;
          
          // Update host status for remaining users
          for (const [socketId, user] of room.users) {
            const userSocket = io.sockets.sockets.get(socketId);
            if (userSocket) {
              userSocket.isHost = user.username === room.host;
            }
          }
          
          io.to(roomId).emit('host-changed', { newHost: room.host });
        }
        
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
