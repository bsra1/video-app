const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

// 🔥 CORS Ayarını buraya ekliyoruz
const io = new Server(server, {
  cors: {
    origin: "*", // yayınlayınca burayı kendi frontend adresinle sınırla!
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, "../client")));

const rooms = {};

io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı:", socket.id);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);

    if (!rooms[roomId]) rooms[roomId] = [];
    rooms[roomId].push(socket.id);

    socket.to(roomId).emit("user-joined", socket.id);

    socket.on("signal", (data) => {
      io.to(data.target).emit("signal", {
        from: socket.id,
        signal: data.signal,
      });
    });

    socket.on("disconnect", () => {
      socket.to(roomId).emit("user-left", socket.id);
      rooms[roomId] = rooms[roomId].filter((id) => id !== socket.id);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server çalışıyor: http://localhost:${PORT}`);
});
