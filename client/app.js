let socket;
let localCameraStream = null;
let localScreenStream = null;
const peers = {};
let screenSharerId = null;
let username = "";
let roomId = "";
let userId = null;

const modalOverlay = document.getElementById("modalOverlay");
const joinBtn = document.getElementById("joinBtn");

joinBtn.onclick = () => {
  username = document.getElementById("usernameInput").value.trim();
  roomId = document.getElementById("roomIdInput").value.trim();
  if (!username || !roomId) {
    alert("Lütfen adınızı ve oda ID'nizi girin.");
    return;
  }
  modalOverlay.style.display = "none";
  document.getElementById("mainContent").style.display = "flex";

  initSocket();
};

function initSocket() {
  socket = io("https://video-app-lcl0.onrender.com");

  socket.on("connect", () => {
    userId = socket.id;
    socket.emit("join-room", { roomId, username });
  });

  socket.on("update-user-list", (users) => {
    updateUserList(users);
  });

  socket.on("screen-share-started", (userIdStarted) => {
    screenSharerId = userIdStarted;
    updateUserList();
  });

  socket.on("screen-share-stopped", () => {
    screenSharerId = null;
    updateUserList();
    clearScreenShareVideo();
  });

  socket.on("user-joined", (newUserId) => {
    if (newUserId === socket.id) return;
    if (!peers[newUserId]) createPeer(newUserId, true);
  });

  socket.on("signal", ({ from, signal }) => {
    if (!peers[from]) createPeer(from, false);
    peers[from].signal(signal);
  });

  socket.on("user-left", (leftUserId) => {
    removePeer(leftUserId);
  });

  socket.on("stop-screen-share-request", (fromUserId) => {
    if (screenSharerId === userId && fromUserId !== userId) {
      stopScreenSharing();
    }
  });
}

let currentUsers = [];
function updateUserList(users) {
  if (users) currentUsers = users;
  const userList = document.getElementById("userList");
  userList.innerHTML = "";

  currentUsers.forEach(user => {
    const li = document.createElement("li");
    li.textContent = user.name;
    li.title = user.id;
    if (user.id === screenSharerId) {
      li.classList.add("screen-sharing");
      li.textContent += " (Ekran Paylaşıyor)";
    }
    userList.appendChild(li);
  });
}

function createPeer(peerId, initiator) {
  // Kamera ve ekran stream'leri birbirinden bağımsız yönetilecek
  // Kamera stream'i varsa ekle, ekran stream'i varsa ekle
  const peer = new SimplePeer({
    initiator,
    trickle: false,
    stream: null, // Başlangıçta stream eklemiyoruz
  });

  peer.on("signal", (signal) => {
    socket.emit("signal", { target: peerId, signal });
  });

  peer.on("stream", (stream) => {
    handleIncomingStream(peerId, stream);
  });

  peer.on("close", () => {
    removePeer(peerId);
  });

  peers[peerId] = peer;

  // Kamera stream'i varsa ekle
  if (localCameraStream) {
    localCameraStream.getTracks().forEach(track => {
      peer.addTrack(track, localCameraStream);
    });
  }
  // Ekran stream'i varsa ekle
  if (localScreenStream) {
    localScreenStream.getTracks().forEach(track => {
      peer.addTrack(track, localScreenStream);
    });
  }

  return peer;
}

// Gelen stream'in türünü ayırt et
function handleIncomingStream(peerId, stream) {
  const videoTracks = stream.getVideoTracks();
  if (videoTracks.length === 0) return;

  // Ekran paylaşımı yapan kullanıcıdan gelen stream ise üst kutuda göster
  if (peerId === screenSharerId) {
    setScreenShareVideo(stream, peerId);
    // Kamera videolarını etkileme!
  } else {
    addCameraVideo(peerId, stream);
  }
}

function setScreenShareVideo(stream, peerId) {
  const video = document.getElementById("screenShareVideo");
  video.srcObject = stream;
  video.title = getUserNameById(peerId) + " (Ekran Paylaşıyor)";
}

function clearScreenShareVideo() {
  const video = document.getElementById("screenShareVideo");
  video.srcObject = null;
}

function addCameraVideo(peerId, stream) {
  let video = document.getElementById("cameraVideo-" + peerId);
  if (!video) {
    video = document.createElement("video");
    video.id = "cameraVideo-" + peerId;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = (peerId === userId); // Kendi kamerasıysa sessizle
    video.title = getUserNameById(peerId);
    document.getElementById("cameraVideos").appendChild(video);
  }
  video.srcObject = stream;
}

function removeCameraVideo(peerId) {
  const video = document.getElementById("cameraVideo-" + peerId);
  if (video) video.remove();
}

function removePeer(peerId) {
  if (peers[peerId]) {
    peers[peerId].destroy();
    delete peers[peerId];
  }
  removeCameraVideo(peerId);

  if (peerId === screenSharerId) {
    clearScreenShareVideo();
    screenSharerId = null;
  }

  currentUsers = currentUsers.filter(u => u.id !== peerId);
  updateUserList();
}

function getUserNameById(id) {
  const user = currentUsers.find(u => u.id === id);
  return user ? user.name : "Bilinmeyen";
}

// Kamera açma butonu
document.getElementById("shareCamera").onclick = async () => {
  try {
    // Önce varsa önceki kamera stream'ini kapat
    if(localCameraStream) {
      localCameraStream.getTracks().forEach(t => t.stop());
      localCameraStream = null;
    }

    localCameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    addCameraVideo(userId, localCameraStream);

    // Kamera stream'ini tüm peer'lara ekle
    for (const peer of Object.values(peers)) {
      localCameraStream.getTracks().forEach(track => {
        peer.addTrack(track, localCameraStream);
      });
    }
  } catch (err) {
    alert("Kamera açılırken hata: " + err.message);
  }
};

// Ekran paylaşımı kutusuna tıklayınca fullscreen aç/kapa (Ekran paylaşımı yapan sadece diğerleri açabilir)
document.getElementById("screenShareContainer").onclick = () => {
  if(screenSharerId === userId) {
    // Ekran paylaşımı yapan kullanıcı fullscreen açmasın
    return;
  }
  const video = document.getElementById("screenShareVideo");
  if (!document.fullscreenElement) {
    video.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
};

// Ekran paylaşımı başlat/durdur
document.getElementById("shareScreen").onclick = async () => {
  try {
    // Başkası ekran paylaşıyorsa önce durdurması için istek gönder
    if(screenSharerId && screenSharerId !== userId) {
      socket.emit("stop-screen-share-request", screenSharerId);
      await new Promise(res => setTimeout(res, 1000));
    }

    // Eğer zaten ekran paylaşıyorsan durdur
    if(screenSharerId === userId) {
      stopScreenSharing();
      return;
    }

    // Ekran paylaşımı başlat
    socket.emit("start-screen-share");

    // Önceki ekran stream'ini durdur
    if(localScreenStream) {
      localScreenStream.getTracks().forEach(t => t.stop());
      localScreenStream = null;
    }

    localScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const combinedStream = new MediaStream([
      ...localScreenStream.getVideoTracks(),
      ...micStream.getAudioTracks()
    ]);

    setScreenShareVideo(combinedStream, userId);

    // Ekran stream'ini tüm peer'lara ekle
    for (const peer of Object.values(peers)) {
      combinedStream.getTracks().forEach(track => {
        peer.addTrack(track, combinedStream);
      });
    }

    screenSharerId = userId;
    updateUserList();

    localScreenStream.getVideoTracks()[0].addEventListener("ended", () => {
      stopScreenSharing();
    });
  } catch (err) {
    alert("Ekran paylaşımı başlatılırken hata: " + err.message);
  }
};

function stopScreenSharing() {
  if(localScreenStream) {
    localScreenStream.getTracks().forEach(t => t.stop());
    localScreenStream = null;
  }
  clearScreenShareVideo();
  socket.emit("stop-screen-share");
  screenSharerId = null;
  updateUserList();
}

// Kamera videolarına tıklanınca fullscreen aç/kapa
document.getElementById("cameraVideos").addEventListener("click", e => {
  if (e.target.tagName === "VIDEO") {
    const video = e.target;
    if (!document.fullscreenElement) {
      video.requestFullscreen();
      video.classList.add("fullscreen");
    } else {
      document.exitFullscreen();
      video.classList.remove("fullscreen");
    }
  }
});
