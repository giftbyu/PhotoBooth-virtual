// pages/api/socket.js
import { Server } from 'socket.io';

// Handler untuk API route
const SocketHandler = (req, res) => {
  // Cek jika server socket.io sudah berjalan di instance server ini
  if (res.socket.server.io) {
    console.log('Socket.IO server already running.');
  } else {
    console.log('Starting new Socket.IO server...');
    // Buat instance server Socket.IO baru di server HTTP Next.js
    const io = new Server(res.socket.server);
    // Simpan instance io agar tidak dibuat ulang di request berikutnya
    res.socket.server.io = io;

    // --- Logika Koneksi Socket.IO ---
    io.on('connection', (socket) => {
      console.log(`🔌 User connected: ${socket.id}`);

      // Event saat user ingin bergabung ke room
      socket.on('join-room', (roomID) => {
        socket.join(roomID); // Masukkan socket user ke room
        console.log(`User ${socket.id} joined room ${roomID}`);

        // Beri tahu pengguna LAIN di room bahwa ada yang baru bergabung
        // Ini akan memicu user lain untuk mengirim 'offer'
        socket.to(roomID).emit('user-joined', socket.id);
      });

      // Meneruskan sinyal 'offer' dari inisiator ke target
      socket.on('offer', (payload) => {
        console.log(`Relaying offer from ${payload.callerID} to ${payload.userToSignal}`);
        io.to(payload.userToSignal).emit('offer-received', {
          signal: payload.signal,
          callerID: payload.callerID,
        });
      });

      // Meneruskan sinyal 'answer' dari penerima kembali ke inisiator
      socket.on('answer', (payload) => {
         console.log(`Relaying answer from ${socket.id} to ${payload.callerID}`);
        io.to(payload.callerID).emit('answer-received', {
          signal: payload.signal,
          socketID: socket.id, // ID pengirim answer
        });
      });

      // Menangani saat user disconnect
      socket.on('disconnecting', () => {
         console.log(`🔌 User disconnecting: ${socket.id}`);
         // Beri tahu room bahwa user ini keluar (opsional, tapi bagus untuk UI)
         socket.rooms.forEach(room => {
             if (room !== socket.id) { // Jangan kirim ke diri sendiri
                 socket.to(room).emit('user-disconnected', socket.id);
                 console.log(`Notified room ${room} about user ${socket.id} disconnect`);
             }
         });
      });
       socket.on('disconnect', () => {
          console.log(`🔌 User disconnected: ${socket.id}`);
      });
    });
  }
  // Akhiri respons HTTP karena server socket berjalan di background
  res.end();
};

export default SocketHandler;