const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // Geliştirme için açık, prod da domain sınırla
    methods: ["GET", "POST"],
  },
});

const rooms = {};

io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı:", socket.id);

  socket.on("join-room", ({ roomId, username }) => {
    socket.join(roomId);

    if (!rooms[roomId]) rooms[roomId] = [];

    // Eğer kullanıcı zaten varsa tekrar eklemeyelim
    if (!rooms[roomId].some(u => u.id === socket.id)) {
      rooms[roomId].push({ id: socket.id, name: username });
    }

    // Kullanıcı listesi gönder
    io.to(roomId).emit("update-user-list", rooms[roomId]);

    // Diğer kullanıcılara haber ver
    socket.to(roomId).emit("user-joined", socket.id);

    // Ekran paylaşma eventleri
    socket.on("start-screen-share", () => {
      // O odadaki tüm diğer ekran paylaşanları durdur
      const currentSharer = rooms[roomId].find(u => u.isScreenSharing);
      if (currentSharer && currentSharer.id !== socket.id) {
        // Önceki ekran paylaşan bilgisini temizle
        currentSharer.isScreenSharing = false;
        io.to(roomId).emit("screen-share-stopped", currentSharer.id);
      }
      // Bu kullanıcıyı ekran paylaşan yap
      const user = rooms[roomId].find(u => u.id === socket.id);
      if (user) {
        user.isScreenSharing = true;
      }
      io.to(roomId).emit("screen-share-started", socket.id);
    });

    socket.on("stop-screen-share", () => {
      const user = rooms[roomId].find(u => u.id === socket.id);
      if (user) {
        user.isScreenSharing = false;
      }
      io.to(roomId).emit("screen-share-stopped");
    });

    socket.on("signal", (data) => {
      io.to(data.target).emit("signal", {
        from: socket.id,
        signal: data.signal,
      });
    });

    socket.on("disconnect", () => {
      // Kullanıcıyı odadan çıkar
      if (rooms[roomId]) {
        rooms[roomId] = rooms[roomId].filter((u) => u.id !== socket.id);

        // Eğer ekran paylaşanıysa yayın durdurulsun
        io.to(roomId).emit("screen-share-stopped", socket.id);

        io.to(roomId).emit("update-user-list", rooms[roomId]);
        socket.to(roomId).emit("user-left", socket.id);

        // Temizle boşsa oda
        if (rooms[roomId].length === 0) {
          delete rooms[roomId];
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server çalışıyor: http://localhost:${PORT}`);
});
