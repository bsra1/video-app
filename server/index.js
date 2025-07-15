const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, "../client")));

const rooms = {};

io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı:", socket.id);

  socket.on("join-room", ({ roomId, username }) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = { screenSharer: null, users: [] };
    }

    rooms[roomId].users.push({ id: socket.id, name: username });

    io.to(roomId).emit("update-user-list", rooms[roomId].users);

    socket.to(roomId).emit("user-joined", socket.id);

    socket.on("start-screen-share", () => {
      const currentSharer = rooms[roomId].screenSharer;
      if (currentSharer && currentSharer !== socket.id) {
        io.to(currentSharer).emit("stop-screen-share");
        rooms[roomId].screenSharer = null;
      }
      rooms[roomId].screenSharer = socket.id;
      io.to(roomId).emit("screen-share-started", socket.id);
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

    socket.on("request-user-list-update", () => {
      if (rooms[roomId]) {
        io.to(roomId).emit("update-user-list", rooms[roomId].users);
      }
    });

    socket.on("disconnect", () => {
      socket.to(roomId).emit("user-left", socket.id);
      if (!rooms[roomId]) return;

      rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);
      if (rooms[roomId].screenSharer === socket.id) {
        rooms[roomId].screenSharer = null;
        socket.to(roomId).emit("screen-share-stopped", socket.id);
      }
      io.to(roomId).emit("update-user-list", rooms[roomId].users);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server çalışıyor: http://localhost:${PORT}`);
});
