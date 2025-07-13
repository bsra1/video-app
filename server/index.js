const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // Yayına alırken sadece frontend domain ekle
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, "../client")));

const rooms = {}; // roomId -> { screenSharer: socketId, users: [] }

io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı:", socket.id);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = { screenSharer: null, users: [] };
    }
    rooms[roomId].users.push(socket.id);

    socket.to(roomId).emit("user-joined", socket.id);

    socket.on("start-screen-share", () => {
      const currentSharer = rooms[roomId].screenSharer;
      if (currentSharer && currentSharer !== socket.id) {
        io.to(currentSharer).emit("stop-screen-share");
      }
      rooms[roomId].screenSharer = socket.id;
      socket.to(roomId).emit("screen-share-started", socket.id);
    });

    socket.on("stop-screen-share", () => {
      if (rooms[roomId].screenSharer === socket.id) {
        rooms[roomId].screenSharer = null;
        socket.to(roomId).emit("screen-share-stopped", socket.id);
      }
    });

    socket.on("signal", (data) => {
      io.to(data.target).emit("signal", {
        from: socket.id,
        signal: data.signal,
      });
    });

    socket.on("disconnect", () => {
      socket.to(roomId).emit("user-left", socket.id);
      rooms[roomId].users = rooms[roomId].users.filter(id => id !== socket.id);

      if (rooms[roomId].screenSharer === socket.id) {
        rooms[roomId].screenSharer = null;
        socket.to(roomId).emit("screen-share-stopped", socket.id);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server çalışıyor: http://localhost:${PORT}`);
});
