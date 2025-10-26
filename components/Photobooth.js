import React, { useRef, useEffect, useState } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer'; // Menggunakan simple-peer

// Variabel di luar komponen agar tidak reset saat re-render
let socket;
let peer;
let reviewTimerInterval = null;
let reviewTimeoutId = null;

// Komponen Photobooth menerima 'options' dan fungsi 'onBack', 'onFinish'
function Photobooth({ options, onBack, onFinish }) {
  // Destructuring options dari props
  const { mode, layout, photoCount, filter, stripColor, text } = options;

  // --- Refs (Pengganti getElementById) ---
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const canvasRef = useRef(null); // Hidden canvas for processing
  const reviewCanvasRef = useRef(null); // Canvas for review overlay
  const videoContainerRef = useRef(null);
  const localVideoWrapperRef = useRef(null);
  const remoteVideoWrapperRef = useRef(null);
  const videoGridRef = useRef(null);
  const videoLabelsRef = useRef(null);
  const countdownOverlayRef = useRef(null);
  const reviewOverlayRef = useRef(null);
  const captureButtonRef = useRef(null);
  const backButtonRef = useRef(null);

  // --- State (Pengganti Variabel Global) ---
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null); // Khusus LDR
  const [isCapturing, setIsCapturing] = useState(false); // Status apakah sedang mengambil foto strip
  const [capturedFrames, setCapturedFrames] = useState([]); // Menyimpan elemen canvas mentah hasil capture
  const [countdownText, setCountdownText] = useState(''); // Teks overlay countdown ('3', '2', '1', 'CEKREK!')
  const [showReview, setShowReview] = useState(false); // Menampilkan/menyembunyikan overlay review foto
  const [reviewTimer, setReviewTimer] = useState(8); // Timer hitung mundur di layar review
  const [captureButtonText, setCaptureButtonText] = useState(`Take ${photoCount} Photo Strip`); // Teks tombol capture
  const [isLdrConnected, setIsLdrConnected] = useState(false); // Status koneksi WebRTC untuk LDR
  const [error, setError] = useState(null); // Menyimpan pesan error (misal: gagal akses kamera)

  // --- Fungsi Helper (Salin dari HTML Anda) ---
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // --- Logika WebRTC (Hanya untuk Mode LDR) ---
  // DEFINISI FUNGSI INI HARUS ADA SEBELUM DIPANGGIL DI useEffect
  function setupLDRConnection(stream) {
      if (!stream) return;
      console.log("Setting up LDR Connection...");

      // 1. Hubungkan ke Server Signaling (Next.js API Route)
      // Pastikan file pages/api/socket.js sudah dibuat dan berjalan
      socket = io(); // Otomatis mengarah ke /api/socket

      // Ganti Room ID dengan ID unik (bisa dibuat atau di-generate)
      // Untuk tes, kita bisa minta pengguna memasukkan nama room
      const roomID = prompt("Masukkan Nama Room LDR (harus sama dengan pasangan):") || "default-room";
      if (!roomID) {
          setError("Nama Room LDR diperlukan.");
          onBack(); // Kembali jika room ID tidak dimasukkan
          return;
      }

      socket.emit('join-room', roomID);
      console.log(`Mencoba bergabung ke room: ${roomID}`);

      // 2. Logika Simple-Peer

      // A. Anda adalah INISIATOR (orang pertama di room, atau orang kedua join)
      socket.on('user-joined', (userID) => {
          // Jangan buat peer baru jika sudah ada
          if (peer && !peer.destroyed) return;

          console.log(`User ${userID} bergabung. Saya (inisiator ${socket.id}) akan mengirim offer.`);
          setIsLdrConnected(false); // Tandai belum terhubung

          peer = new Peer({
              initiator: true,
              trickle: false, // Sinyal lebih sederhana
              stream: stream, // Kirim stream lokal kita
          });

          // Kirim sinyal "offer" ke user baru
          peer.on('signal', (signal) => {
              console.log("Mengirim offer ke", userID);
              socket.emit('offer', { userToSignal: userID, signal, callerID: socket.id });
          });

          // Saat stream remote diterima dari user lain
          peer.on('stream', (remoteStreamData) => {
              console.log("Menerima stream remote!");
              setRemoteStream(remoteStreamData);
              if (remoteVideoRef.current) {
                  remoteVideoRef.current.srcObject = remoteStreamData;
              }
              setIsLdrConnected(true); // Tandai sudah terhubung
              console.log("Koneksi LDR terbentuk (sebagai inisiator)!");
          });

          peer.on('connect', () => {
              console.log('Peer terhubung! (Inisiator)');
              setIsLdrConnected(true);
          });

          peer.on('error', (err) => {
              console.error('Peer connection error (Inisiator):', err);
              setError("Koneksi LDR gagal. Coba refresh.");
              setIsLdrConnected(false);
              if(peer) peer.destroy(); peer = null;
          });
          peer.on('close', () => {
              console.log('Peer connection closed (Inisiator).');
              setRemoteStream(null);
              setIsLdrConnected(false);
              setError("Koneksi LDR terputus.");
               if(peer) peer.destroy(); peer = null;
          });
      });

      // B. Anda adalah PENERIMA (Anda sudah di room, orang lain mengirim offer)
      socket.on('offer-received', (payload) => {
           // Jangan buat peer baru jika sudah ada
          if (peer && !peer.destroyed) return;

          console.log("Menerima offer dari", payload.callerID);
          setIsLdrConnected(false);

          peer = new Peer({
              initiator: false,
              trickle: false,
              stream: stream, // Kirim stream lokal kita juga
          });

          // Kirim sinyal "answer" kembali ke inisiator
          peer.on('signal', (signal) => {
             console.log("Mengirim answer ke", payload.callerID);
              socket.emit('answer', { signal, callerID: payload.callerID });
          });

          // Terima "offer" dari inisiator
          peer.signal(payload.signal);

          // Saat stream remote diterima dari inisiator
          peer.on('stream', (remoteStreamData) => {
              console.log("Menerima stream remote!");
              setRemoteStream(remoteStreamData);
              if (remoteVideoRef.current) {
                  remoteVideoRef.current.srcObject = remoteStreamData;
              }
              setIsLdrConnected(true);
              console.log("Koneksi LDR terbentuk (sebagai penerima)!");
          });

           peer.on('connect', () => {
              console.log('Peer terhubung! (Penerima)');
              setIsLdrConnected(true);
           });

           peer.on('error', (err) => {
              console.error('Peer connection error (Penerima):', err);
              setError("Koneksi LDR gagal. Coba refresh.");
              setIsLdrConnected(false);
               if(peer) peer.destroy(); peer = null;
          });
          peer.on('close', () => {
              console.log('Peer connection closed (Penerima).');
              setRemoteStream(null);
              setIsLdrConnected(false);
              setError("Koneksi LDR terputus.");
               if(peer) peer.destroy(); peer = null;
          });
      });

       // Terima sinyal "answer" jika Anda inisiator
       socket.on('answer-received', (payload) => {
             // Pastikan peer belum terhubung atau hancur
             if (peer && !peer.destroyed && !peer.connected && peer.initiator) {
                console.log("Menerima answer dari", payload.socketID);
                peer.signal(payload.signal);
             }
        });


      // Tangani jika user lain disconnect (opsional tapi bagus)
       socket.on('user-disconnected', (userID) => {
            console.log(`User ${userID} disconnected.`);
            if (peer) {
                 peer.destroy();
                 peer = null;
                 setRemoteStream(null);
                 setIsLdrConnected(false);
                 setError("Pasangan Anda terputus.");
            }
       });

      // Tangani jika koneksi ke server signaling putus
      socket.on('disconnect', () => {
          console.log("Terputus dari server signaling.");
          setError("Koneksi ke server terputus.");
          setIsLdrConnected(false);
          if (peer) { peer.destroy(); peer = null; }
          setRemoteStream(null);
      });
  }


  // --- useEffect untuk Setup Kamera & WebRTC (Dijalankan sekali saat komponen dimuat) ---
  useEffect(() => {
    let currentStream = null; // Variabel lokal untuk menyimpan stream aktif

    async function setupCameraAndConnection() {
      setError(null); // Reset error setiap kali setup
      console.log("Attempting to access camera...");
      // 1. Akses Kamera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: mode === 'ldr', // Hanya aktifkan audio jika LDR
        });
        console.log("Camera access granted.");
        currentStream = stream; // Simpan stream ke variabel lokal
        setLocalStream(stream); // Simpan ke state

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
           // Tunggu video siap dimainkan
           await localVideoRef.current.play().catch(e => console.error("Error playing local video:", e));
        }

        // 2. Setup WebRTC jika mode LDR
        if (mode === 'ldr') {
          // Awalnya sembunyikan video remote sampai terhubung
          if (remoteVideoWrapperRef.current) remoteVideoWrapperRef.current.style.display = 'none';
          if (remoteVideoRef.current) remoteVideoRef.current.style.display = 'none';
          setupLDRConnection(stream); // PANGGIL FUNGSI YANG SUDAH DIDEFINISIKAN DI ATAS

        } else {
          // Mode Solo: Tidak perlu koneksi LDR
          setIsLdrConnected(true); // Anggap "terhubung" di mode solo agar tombol capture aktif
           if (remoteVideoWrapperRef.current) remoteVideoWrapperRef.current.classList.add('hidden'); // Sembunyikan wrapper remote
        }

      } catch (err) {
        console.error("Error accessing camera:", err);
        setError("Kamera tidak dapat diakses. Mohon izinkan akses kamera di browser Anda dan refresh halaman.");
        // Anda bisa memanggil onBack() di sini jika ingin otomatis kembali
        // onBack();
      }
    }

    setupCameraAndConnection();

    // Cleanup function: Dijalankan saat komponen di-unmount (misal: saat kembali ke layar lain)
    return () => {
      console.log("Cleaning up Photobooth component...");
      // Matikan kamera
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        console.log("Camera stream stopped.");
      }
       if (localVideoRef.current && localVideoRef.current.srcObject) {
         localVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
         localVideoRef.current.srcObject = null;
      }
      setLocalStream(null); // Reset state stream
      setRemoteStream(null);

      // Hentikan koneksi WebRTC jika ada
      if (peer) {
        peer.destroy();
        peer = null;
        console.log("Peer connection destroyed.");
      }
      // Hentikan koneksi Socket.IO jika ada
      if (socket) {
        socket.disconnect();
        socket = null;
        console.log("Socket disconnected.");
      }
      // Bersihkan timer review jika ada
      if (reviewTimerInterval) clearInterval(reviewTimerInterval);
      if (reviewTimeoutId) clearTimeout(reviewTimeoutId);
    };
    // Dependency array: [mode] berarti setup ulang jika mode berubah (misal dari solo ke ldr)
  }, [mode]);

  // --- useEffect untuk Menyesuaikan UI berdasarkan Mode, Layout, Filter, dan Status Koneksi LDR ---
  useEffect(() => {
    // Terapkan filter CSS ke elemen video
    if (localVideoRef.current) {
        // className harus sama persis dengan definisi di globals.css
        localVideoRef.current.className = `scale-x-[-1] ${filter}`;
    }
    if (remoteVideoRef.current) {
        remoteVideoRef.current.className = filter;
    }

    // Atur aspek rasio wrapper video
    let targetAspectClass = 'aspect-tall'; // Default (polaroid & quad)
    if (layout === 'duo') {
      targetAspectClass = 'aspect-wide';
    }
    const wrappers = [localVideoWrapperRef.current, remoteVideoWrapperRef.current];
    wrappers.forEach(wrapper => {
      if (wrapper) {
        wrapper.classList.remove('aspect-tall', 'aspect-wide');
        wrapper.classList.add(targetAspectClass);
      }
    });

    // Atur tampilan grid dan label berdasarkan mode
    if (videoGridRef.current && videoLabelsRef.current && remoteVideoWrapperRef.current) {
        if (mode === 'solo') {
            remoteVideoWrapperRef.current.classList.add('hidden'); // Sembunyikan video remote
            videoGridRef.current.classList.remove('md:grid-cols-2'); // Hapus layout 2 kolom di desktop
            videoGridRef.current.classList.add('grid-cols-1', 'max-w-md', 'mx-auto'); // Jadi 1 kolom & tengahkan
            videoLabelsRef.current.classList.add('hidden'); // Sembunyikan label
        } else { // Mode LDR
            // Tampilkan wrapper video remote hanya jika LDR sudah terhubung
            if (isLdrConnected && remoteStream) { // Periksa juga remoteStream
                 remoteVideoWrapperRef.current.classList.remove('hidden');
                 remoteVideoWrapperRef.current.style.display = ''; // Tampilkan kembali
                 if(remoteVideoRef.current) remoteVideoRef.current.style.display = '';
            } else {
                 // Sembunyikan jika belum terhubung atau stream belum ada
                 remoteVideoWrapperRef.current.classList.add('hidden');
                 remoteVideoWrapperRef.current.style.display = 'none';
                 if(remoteVideoRef.current) remoteVideoRef.current.style.display = 'none';
            }
            videoGridRef.current.classList.add('md:grid-cols-2'); // Aktifkan layout 2 kolom di desktop
            videoGridRef.current.classList.remove('grid-cols-1', 'max-w-md', 'mx-auto'); // Hapus styling solo
            videoLabelsRef.current.classList.remove('hidden'); // Tampilkan label
            // Ganti label video kedua jika LDR
             if(videoLabelsRef.current.children[1]) {
                videoLabelsRef.current.children[1].textContent = "Your partner";
            }
        }
    }

  }, [mode, layout, filter, isLdrConnected, remoteStream]); // Update UI jika state ini berubah

  // --- Logika Pengambilan Foto (Diterjemahkan dari HTML Anda) ---

  // Menjalankan Hitung Mundur (Gunakan State)
  async function runCountdown(poseNumber) {
    if (countdownOverlayRef.current) countdownOverlayRef.current.classList.remove('hidden');
    setCountdownText(`Pose ke-${poseNumber}`);
    await sleep(1500);
    setCountdownText('3'); await sleep(1000);
    setCountdownText('2'); await sleep(1000);
    setCountdownText('1'); await sleep(1000);
    setCountdownText('Cheesee!');
    if (videoContainerRef.current) videoContainerRef.current.classList.add('flash');
    await sleep(500);
    if (videoContainerRef.current) videoContainerRef.current.classList.remove('flash');
    if (countdownOverlayRef.current) countdownOverlayRef.current.classList.add('hidden');
    setCountdownText(''); // Reset text agar overlay hilang
    await sleep(500); // Jeda sebelum review
  }

   // Mengambil 1 Frame (SOLO atau LDR QUAD - pakai Ref)
   function captureCurrentFrame(forReview = false) {
       const poseNumber = capturedFrames.length + 1;

       let videoToUse = localVideoRef.current;
       let wrapper = localVideoWrapperRef.current;
       let isLocal = true;

       // Tentukan video mana yang diambil untuk LDR Quad
       if (mode === 'ldr') {
           if (layout === 'quad' && (poseNumber === 2 || poseNumber === 4)) {
               videoToUse = remoteVideoRef.current;
               wrapper = remoteVideoWrapperRef.current;
               isLocal = false;
           } else if (layout !== 'quad') {
               // Untuk Duo/Polaroid LDR, panggil fungsi captureLDRFrame
               return captureLDRFrame(forReview);
           }
       }

       // Pastikan elemen video dan wrapper siap
       if (!videoToUse || videoToUse.videoWidth === 0 || !wrapper) {
            console.error("Video element not ready for capture (Solo/Quad).");
            setError("Gagal mengambil gambar: Video belum siap.");
            return null; // Return null jika video belum siap
       }

       const rawW = videoToUse.videoWidth;
       const rawH = videoToUse.videoHeight;
       const rawRatio = rawW / rawH; // Rasio asli video (biasanya 4:3 atau 16:9)

       // Tentukan rasio target berdasarkan kelas CSS wrapper
       let destRatio;
       if (wrapper.classList.contains('aspect-tall')) destRatio = 100 / 107; // ~0.93
       else if (wrapper.classList.contains('aspect-wide')) destRatio = 1000 / 515; // ~1.94
       else destRatio = rawRatio; // Jika tidak ada kelas, gunakan rasio asli

       let sX = 0, sY = 0, sW = rawW, sH = rawH; // Koordinat sumber (source) di video

       // Logika 'object-fit: cover' untuk menghitung area crop
       if (rawRatio > destRatio) { // Video lebih lebar dari target -> crop kiri/kanan
           sH = rawH;
           sW = rawH * destRatio; // Lebar sumber sesuai rasio target
           sX = (rawW - sW) / 2; // Mulai crop dari tengah
           sY = 0;
       } else { // Video lebih tinggi dari target -> crop atas/bawah
           sW = rawW;
           sH = rawW / destRatio; // Tinggi sumber sesuai rasio target
           sX = 0;
           sY = (rawH - sH) / 2; // Mulai crop dari tengah
       }

       // Buat canvas sementara untuk menggambar frame yang sudah di-crop dan di-filter
       const tempCanvas = document.createElement('canvas');
       tempCanvas.width = sW; // Lebar canvas = lebar area crop
       tempCanvas.height = sH; // Tinggi canvas = tinggi area crop
       const tempCtx = tempCanvas.getContext('2d');
       if (!tempCtx) return null; // Handle jika context gagal dibuat

       // Terapkan filter CSS yang aktif pada video ke canvas
       tempCtx.filter = window.getComputedStyle(videoToUse).filter;

       // Gambar ke canvas, lakukan mirroring jika ini video lokal
       if (isLocal) {
           tempCtx.save();
           tempCtx.scale(-1, 1); // Balik horizontal
           // Gambar area crop (sX, sY, sW, sH) dari video ke canvas (-sW karena sudah di-flip)
           tempCtx.drawImage(videoToUse, sX, sY, sW, sH, -sW, 0, sW, sH);
           tempCtx.restore();
       } else {
           // Gambar video remote tanpa mirroring
           tempCtx.drawImage(videoToUse, sX, sY, sW, sH, 0, 0, sW, sH);
       }

       // Jika dipanggil untuk review, gambar hasil ke review canvas
       if (forReview && reviewCanvasRef.current) {
           const reviewCtx = reviewCanvasRef.current.getContext('2d');
           if (reviewCtx) {
                reviewCanvasRef.current.width = sW; // Sesuaikan ukuran review canvas
                reviewCanvasRef.current.height = sH;
                reviewCtx.drawImage(tempCanvas, 0, 0); // Gambar hasil (yg sudah di-mirror jika perlu)
           }
       }

       return tempCanvas; // Kembalikan elemen canvas mentah yang berisi frame
   }

    // Mengambil 1 Frame Gabungan (LDR DUO / LDR POLAROID - pakai Ref)
    function captureLDRFrame(forReview = false) {
        const localVid = localVideoRef.current;
        const remoteVid = remoteVideoRef.current;
        const localWrap = localVideoWrapperRef.current; // Ambil wrapper lokal untuk cek rasio

        // Pastikan kedua video siap
        if (!localVid || !remoteVid || localVid.videoWidth === 0 || remoteVid.videoWidth === 0 || !localWrap) {
             console.error("Video elements not ready for capture (LDR Duo/Polaroid).");
             setError("Failed to capture image: Partner video not ready.");
             return null;
        }

        // Asumsi kedua video memiliki dimensi SAMA (misal 640x480)
        const rawW = localVid.videoWidth;
        const rawH = localVid.videoHeight;

        // Tentukan rasio target untuk SATU video (berdasarkan kelas CSS wrapper)
        let destRatioPerVideo;
        if (localWrap.classList.contains('aspect-tall')) destRatioPerVideo = 100 / 107;
        else if (localWrap.classList.contains('aspect-wide')) destRatioPerVideo = 1000 / 515;
        else destRatioPerVideo = rawW / rawH; // Jika tidak ada kelas aspek, gunakan rasio asli

        let sX = 0, sY = 0, sW = rawW, sH = rawH; // Koordinat sumber

        // Logika 'object-fit: cover' untuk SATU video
        const rawRatioSingle = rawW / rawH;
        if (rawRatioSingle > destRatioPerVideo) { // Crop kiri/kanan
            sH = rawH; sW = rawH * destRatioPerVideo; sX = (rawW - sW) / 2; sY = 0;
        } else { // Crop atas/bawah
            sW = rawW; sH = rawW / destRatioPerVideo; sX = 0; sY = (rawH - sH) / 2;
        }

        // Buat canvas sementara untuk menggambar frame GABUNGAN
        const tempCanvas = document.createElement('canvas');
        // Lebar canvas = 2x lebar satu frame crop, tinggi = tinggi satu frame crop
        tempCanvas.width = sW * 2;
        tempCanvas.height = sH;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) return null;

        // 1. Gambar localVideo (DI-MIRROR) ke sisi KIRI canvas
        tempCtx.filter = window.getComputedStyle(localVid).filter; // Terapkan filter
        tempCtx.save();
        tempCtx.scale(-1, 1);
        tempCtx.drawImage(localVid, sX, sY, sW, sH, -sW, 0, sW, sH); // Gambar di area kiri (setelah flip)
        tempCtx.restore();

        // 2. Gambar remoteVideo (TIDAK di-mirror) ke sisi KANAN canvas
        tempCtx.filter = window.getComputedStyle(remoteVid).filter; // Terapkan filter
        tempCtx.drawImage(remoteVid, sX, sY, sW, sH, sW, 0, sW, sH); // Gambar di area kanan

        // Jika untuk review, gambar hasil gabungan ke review canvas
        if (forReview && reviewCanvasRef.current) {
            const reviewCtx = reviewCanvasRef.current.getContext('2d');
            if (reviewCtx) {
                reviewCanvasRef.current.width = sW * 2; // Sesuaikan ukuran review canvas
                reviewCanvasRef.current.height = sH;
                reviewCtx.drawImage(tempCanvas, 0, 0);
            }
        }

        return tempCanvas; // Kembalikan elemen canvas mentah yang berisi frame gabungan
    }


    // Menampilkan Layar Review (Gunakan State)
    function showReviewScreen(frameCanvas, duration) {
       // Menggunakan Promise agar bisa ditunggu (await) di startPhotoStripSequence
       return new Promise((resolve) => {
           // Cek apakah elemen review ada
           if (!reviewOverlayRef.current || !reviewCanvasRef.current) {
               console.error("Review overlay elements not found, automatically keeping photo.");
               resolve('keep'); // Jika elemen tidak ada, otomatis 'keep'
               return;
           }

           // Gambar frame (yang sudah di-crop & mirror jika perlu) ke review canvas
            const reviewCtx = reviewCanvasRef.current.getContext('2d');
            if (reviewCtx) {
                 reviewCanvasRef.current.width = frameCanvas.width;
                 reviewCanvasRef.current.height = frameCanvas.height;
                 reviewCtx.drawImage(frameCanvas, 0, 0);
            } else {
                 console.error("Failed to get review canvas context.");
                 resolve('keep'); // Otomatis 'keep' jika context gagal
                 return;
            }

           setShowReview(true); // Tampilkan overlay
           setReviewTimer(duration); // Reset timer di UI

           // Fungsi untuk membersihkan listener dan timer
           function cleanup(choice) {
               if (reviewTimerInterval) clearInterval(reviewTimerInterval);
               if (reviewTimeoutId) clearTimeout(reviewTimeoutId);
               reviewTimerInterval = null;
               reviewTimeoutId = null;

               // Hapus listener agar tidak menumpuk
               const keepBtn = document.getElementById('keepButton'); // Sementara pakai ID
               const retakeBtn = document.getElementById('retakeButton'); // Sementara pakai ID
               if(keepBtn) keepBtn.onclick = null;
               if(retakeBtn) retakeBtn.onclick = null;

               setShowReview(false); // Sembunyikan overlay
               resolve(choice); // Kirim pilihan ('keep' atau 'retake')
           }

           // Handler untuk tombol (ini cara sementara, idealnya tombolnya komponen React)
           const handleKeepClick = () => cleanup('keep');
           const handleRetakeClick = () => cleanup('retake');

           // Pasang listener ke tombol (SEMENTARA pakai ID)
           const keepBtn = document.getElementById('keepButton');
           const retakeBtn = document.getElementById('retakeButton');
           if(keepBtn) keepBtn.onclick = handleKeepClick;
           if(retakeBtn) retakeBtn.onclick = handleRetakeClick;

           // Mulai timer hitung mundur untuk UI
           reviewTimerInterval = setInterval(() => {
               setReviewTimer(prev => {
                   if (prev <= 1) {
                       clearInterval(reviewTimerInterval);
                       return 0;
                   }
                   return prev - 1;
               });
           }, 1000);

           // Mulai timeout untuk otomatis 'keep'
           reviewTimeoutId = setTimeout(() => {
               console.log("Review time out, keeping photo.");
               cleanup('keep');
           }, duration * 1000);
       });
   }

   // --- Logika Menjahit Strip Foto (Diterjemahkan dari HTML Anda, pakai Ref & Props) ---
    // Menggambar Stiker
    function drawVintageStickers(ctx, areaX, areaY, areaWidth, areaHeight, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        const rand = (min, max) => Math.random() * (max - min) + min;
        // ... (Logika gambar stiker Anda) ...
         // Sticker Bintang (Contoh)
        ctx.save();
        ctx.translate(areaX + areaWidth - rand(30, 60), areaY + rand(30, 60));
        ctx.rotate(rand(-0.2, 0.2));
        ctx.beginPath();
        for (let i = 0; i < 5; i++) { ctx.lineTo(0, 15); ctx.translate(0, 15); ctx.rotate(Math.PI * 0.8); }
        ctx.closePath(); ctx.stroke(); ctx.restore();
         // Sticker Zigzag (Contoh)
        ctx.save();
        ctx.translate(areaX + rand(30, 60), areaY + areaHeight / 2 + rand(-30, 30));
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(20, 10); ctx.lineTo(0, 20); ctx.lineTo(20, 30);
        ctx.stroke(); ctx.restore();
    }

     // Menggambar Branding/Teks
    function drawBranding(ctx, x, y, width, color, customTextValue, defaultText) {
        const textToDraw = customTextValue || defaultText || 'Memories in Bloom';
        let fontSize = 60;
        // Tentukan font berdasarkan apakah teks kustom ada
        if (defaultText === "Memories in Bloom" && !customTextValue) {
             ctx.font = `bold ${fontSize}px "Playfair Display"`; // Font judul default
        } else {
             ctx.font = `italic ${fontSize}px "Lora"`; // Font teks kustom
             fontSize = 45; // Ukuran lebih kecil untuk teks kustom
             ctx.font = `italic ${fontSize}px "Lora"`;
        }
        // Kecilkan font jika teks terlalu panjang
        while (ctx.measureText(textToDraw).width > width - 40 && fontSize > 20) {
            fontSize--;
             if (defaultText === "Memories in Bloom" && !customTextValue) { ctx.font = `bold ${fontSize}px "Playfair Display"`; }
             else { ctx.font = `italic ${fontSize}px "Lora"`; }
        }
        ctx.textAlign = 'center';
        ctx.fillStyle = color;
        ctx.fillText(textToDraw, x + width / 2, y);
    }

    // Menggambar Frame Foto ke Canvas Akhir
    function drawImageWithCover(ctx, imgCanvas, x, y, w, h) {
         if(!imgCanvas) {
            console.warn("Attempted to draw null image canvas.");
            // Gambar kotak placeholder jika canvas null
            ctx.fillStyle = "#cccccc";
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = "#aaaaaa";
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = "#888888";
            ctx.textAlign = "center";
            ctx.fillText("Image Error", x + w/2, y + h/2);
            return;
         };
        // imgCanvas adalah elemen <canvas> dari hasil capture, filter sudah diterapkan
        ctx.drawImage(imgCanvas, x, y, w, h);
    }

   // Fungsi Utama Menjahit Strip (pakai Ref & Props)
   async function stitchFrames(capturedCanvases) {
       const images = capturedCanvases; // Ini adalah array berisi elemen <canvas>
       if (images.length === 0 || !canvasRef.current) return null; // canvasRef -> hiddenCanvas

       const finalCanvas = canvasRef.current;
       const finalCtx = finalCanvas.getContext('2d');
       if (!finalCtx) return null;

       const STRIP_WIDTH = 1080;
       const STRIP_HEIGHT = 1350;
       const PADDING = 40;
       const HEADER_HEIGHT = 150; // Area untuk judul atas "Memories in Bloom"
       const FOOTER_HEIGHT = 200; // Area untuk teks kustom bawah

       finalCanvas.width = STRIP_WIDTH;
       finalCanvas.height = STRIP_HEIGHT;
       finalCtx.filter = 'none'; // Pastikan tidak ada filter aktif

       // Tentukan warna teks & stiker berdasarkan warna strip dari props 'options'
       let textColor, stickerColor;
       if (stripColor === '#efebe9') { // Krem
           textColor = '#5d4037'; stickerColor = '#8d6e63';
       } else { // Hitam atau Coklat Tua
           textColor = '#f5f5dc'; stickerColor = '#a1887f';
       }

       // Gambar latar belakang strip dengan warna terpilih
       finalCtx.fillStyle = stripColor;
       finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

        // Gambar Branding Atas (Statis)
        const headerY = 90; // Posisi vertikal judul
        drawBranding(finalCtx, 0, headerY, STRIP_WIDTH, textColor, "Memories in Bloom", "Memories in Bloom");

        // Gambar Teks Kustom Bawah (jika ada, dari props 'options.text')
        const footerY = STRIP_HEIGHT - (FOOTER_HEIGHT / 2) + 0; // Posisi vertikal teks kustom
        drawBranding(finalCtx, 0, footerY, STRIP_WIDTH, textColor, text, ""); // 'text' dari props

       // Area untuk menempatkan frame foto
       const frameAreaX = PADDING;
       const frameAreaY = HEADER_HEIGHT; // Mulai di bawah header
       const frameAreaWidth = STRIP_WIDTH - PADDING * 2; // Lebar total area foto = 1000
       const frameAreaHeight = STRIP_HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT; // Tinggi total area foto = 1000

        // Gambar Stiker (di area foto)
        drawVintageStickers(finalCtx, frameAreaX, frameAreaY, frameAreaWidth, frameAreaHeight, stickerColor);

       // Logika menggambar frame berdasarkan layout (dari props 'options.layout')
       switch (layout) {
           case 'polaroid': {
               // 1 foto besar: 1000w x 1000h
               const frameHeight = frameAreaHeight;
               drawImageWithCover(finalCtx, images[0], frameAreaX, frameAreaY, frameAreaWidth, frameHeight);
               break;
           }
           case 'duo': {
               const frameInnerPadding = 40; // Jarak vertikal antar foto
               const frameHeight = (frameAreaHeight - frameInnerPadding) / 2; // Tinggi satu foto: (1000 - 40) / 2 = 480
               // Kotak: 1000w x 480h
               drawImageWithCover(finalCtx, images[0], frameAreaX, frameAreaY, frameAreaWidth, frameHeight); // Foto 1
               drawImageWithCover(finalCtx, images[1], frameAreaX, frameAreaY + frameHeight + frameInnerPadding, frameAreaWidth, frameHeight); // Foto 2
               break;
           }
           case 'quad': {
               const frameInnerPadding = 40; // Jarak horizontal & vertikal
               const frameWidth = (frameAreaWidth - frameInnerPadding) / 2; // Lebar satu foto: (1000 - 40) / 2 = 480
               const frameHeight = (frameAreaHeight - frameInnerPadding) / 2; // Tinggi satu foto: (1000 - 40) / 2 = 480
               // Kotak: 480w x 480h

               drawImageWithCover(finalCtx, images[0], frameAreaX, frameAreaY, frameWidth, frameHeight); // Kiri Atas
               drawImageWithCover(finalCtx, images[1], frameAreaX + frameWidth + frameInnerPadding, frameAreaY, frameWidth, frameHeight); // Kanan Atas
               drawImageWithCover(finalCtx, images[2], frameAreaX, frameAreaY + frameHeight + frameInnerPadding, frameWidth, frameHeight); // Kiri Bawah
               drawImageWithCover(finalCtx, images[3], frameAreaX + frameWidth + frameInnerPadding, frameAreaY + frameHeight + frameInnerPadding, frameWidth, frameHeight); // Kanan Bawah
               break;
           }
            default:
                console.error("Layout tidak dikenal:", layout);
       }
       return finalCanvas.toDataURL('image/png'); // Kembalikan URL gambar strip final
   }


   // --- Alur Utama Pengambilan Foto (Gunakan State & Props) ---
   async function startPhotoStripSequence() {
     // Jangan mulai jika LDR belum terhubung
     if (mode === 'ldr' && !isLdrConnected) {
       alert("Waiting for the pair to connect...");
       return;
     }
       setIsCapturing(true); // Disable tombol capture & back
       if (backButtonRef.current) backButtonRef.current.classList.add('hidden'); // Sembunyikan tombol back via ref
       setCapturedFrames([]); // Reset frame di state (jika perlu)

       let currentStripFrames = []; // Array sementara untuk menyimpan frame strip saat ini

       // Loop sebanyak jumlah foto yang dipilih (dari props 'options.photoCount')
       while (currentStripFrames.length < photoCount) {
           const poseNumber = currentStripFrames.length + 1; // Nomor pose (1, 2, 3, atau 4)

           await runCountdown(poseNumber); // Jalankan hitung mundur

           // Tangkap frame saat ini (sudah di-crop & mirror jika perlu), lalu gambar ke review canvas
           const frameCanvas = captureCurrentFrame(true); // true -> gambar ke review canvas

            // Handle jika capture gagal (misal video belum siap)
            if (!frameCanvas) {
                console.error("Capture failed for pose", poseNumber);
                setError("Failed to take a picture. Please try again.");
                setIsCapturing(false); // Enable tombol lagi
                if (backButtonRef.current) backButtonRef.current.classList.remove('hidden'); // Tampilkan tombol back
                return; // Hentikan sequence
            }


           // Tampilkan layar review dan tunggu pilihan user ('keep' atau 'retake') selama 8 detik
           const userChoice = await showReviewScreen(frameCanvas, 8);

           if (userChoice === 'keep') {
               currentStripFrames.push(frameCanvas); // Simpan canvas DATA mentah ke array sementara
           }
           // Jika 'retake', loop akan otomatis mengulang untuk pose yang sama
           // karena currentStripFrames.length belum bertambah
       }

       // --- Jika semua foto sudah 'keep' ---
       setCountdownText('Mencetak...'); // Tampilkan pesan 'Mencetak...'
       if (countdownOverlayRef.current) countdownOverlayRef.current.classList.remove('hidden');

       // Kirim array berisi elemen <canvas> mentah ke fungsi stitch
       const finalStripUrl = await stitchFrames(currentStripFrames);

       if (countdownOverlayRef.current) countdownOverlayRef.current.classList.add('hidden'); // Sembunyikan overlay
       setCountdownText(''); // Reset teks countdown

       // Jika stitch berhasil, panggil onFinish dari props untuk kirim URL gambar ke index.js
       if (finalStripUrl) {
           onFinish(finalStripUrl);
       } else {
            console.error("Stitching failed.");
            setError("Gagal membuat strip foto. Silakan coba lagi.");
       }

       // Reset state setelah selesai
       setIsCapturing(false); // Enable tombol capture & back
       if (backButtonRef.current) backButtonRef.current.classList.remove('hidden'); // Tampilkan tombol back
       // capturedFrames di state tidak diubah, currentStripFrames yang digunakan dan dibuang
   }



  // === RENDER JSX ===
  // Salin struktur HTML dari #photoboothScreen Anda ke sini
  // Ganti id -> ref (jika perlu diakses), class -> className, onclick -> onClick, style="" -> style={{...}}
  return (
    <div id="photoboothScreen">
      {/* Tampilkan pesan error jika ada */}
      {error && <p className="text-red-600 text-center mb-4 p-2 bg-red-100 border border-red-400 rounded">{error}</p>}

      {/* Kontainer Video */}
      <div ref={videoContainerRef} className="bg-gray-200 p-4 rounded-lg shadow-md mb-6 relative border border-gray-300">
        {/* Grid Video */}
        <div ref={videoGridRef} id="videoGrid" className="grid grid-cols-1 gap-4 shadow-inner rounded-md overflow-hidden p-2 bg-gray-300">

          {/* Wrapper Lokal */}
          <div ref={localVideoWrapperRef} id="localVideoWrapper" className="video-wrapper">
            <video ref={localVideoRef} id="localVideo" autoPlay playsInline muted className={`scale-x-[-1] ${filter}`}></video>
          </div>

          {/* Wrapper Remote */}
          {/* Kita tetap render elemennya, tapi visibility diatur oleh useEffect */}
          <div ref={remoteVideoWrapperRef} id="remoteVideoWrapper" className="video-wrapper">
             {/* Tambahkan pesan loading atau menunggu koneksi */}
             {mode === 'ldr' && !isLdrConnected && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-700 text-white italic text-center p-4">
                    Waiting for your partner to join...<br/>Ensure the room name is the same.
                </div>
              )}
               {/* Video remote, srcObject diatur oleh state remoteStream */}
            <video ref={remoteVideoRef} id="remoteVideo" autoPlay playsInline className={filter}></video>
          </div>
        </div>

        {/* Overlay Hitung Mundur (Tampil jika countdownText tidak kosong) */}
        {countdownText && (
          <div ref={countdownOverlayRef} id="countdownOverlay" className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-20 rounded-lg">
            <h2 id="countdownText" className="text-white text-7xl md:text-9xl font-bold text-center" style={{ fontFamily: "'Playfair Display', serif", textShadow: "2px 2px 8px rgba(0,0,0,0.7)" }}>
              {countdownText}
            </h2>
          </div>
        )}

        {/* Overlay Review (Tampil jika showReview true) */}
        {showReview && (
          <div ref={reviewOverlayRef} id="reviewOverlay" className="absolute inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center z-30 rounded-lg p-4">
             <h2 className="text-white text-3xl font-bold mb-4" style={{ fontFamily: "'Playfair Display', serif", textShadow: "1px 1px 4px rgba(0,0,0,0.5)" }}>Photo Preview</h2>
             {/* Canvas untuk menampilkan preview */}
             <canvas ref={reviewCanvasRef} id="reviewCanvas" className="w-auto h-3/5 max-w-full rounded-md border-4 border-white shadow-lg bg-gray-500"></canvas>
             <div className="flex gap-4 mt-6">
                 {/* Tombol ini perlu listener onClick yang di-handle oleh showReviewScreen */}
                 {/* Karena showReviewScreen mengatur listener via ID, kita biarkan ID-nya */}
                 <button id="retakeButton" className="btn-vintage-secondary-elegant bg-white !text-gray-800 py-3 px-6 rounded-md text-lg">Retake</button>
                 <button id="keepButton" className="btn-vintage-elegant py-3 px-6 rounded-md text-lg">Save & Continue</button>
             </div>
             <p id="reviewTimerText" className="text-white text-lg mt-4">Continue in {reviewTimer}...</p>
          </div>
        )}
      </div>

      {/* Label Video */}
      <div ref={videoLabelsRef} id="videoLabels" className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 -mt-4 px-4 text-center text-gray-700 italic">
        <p>You</p>
        {/* Label kedua akan diubah oleh useEffect jika LDR */}
        <p>Your Partner</p>
      </div>

      {/* Tombol Kontrol */}
      <div className="text-center">
        <button
          ref={captureButtonRef}
          id="captureButton"
          className="btn-vintage-elegant py-5 px-12 rounded-full text-xl flex items-center justify-center mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={startPhotoStripSequence}
          // Disable jika sedang capture ATAU jika mode LDR tapi belum connect
          disabled={isCapturing || (mode === 'ldr' && !isLdrConnected)}
        >
          {/* SVG ikon kamera */}
          <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {/* Teks tombol (dari state) */}
          <span id="captureButtonText">{captureButtonText}</span>
        </button>
      </div>

      {/* Tombol Kembali */}
      <div className="text-center mt-4">
        <button
          ref={backButtonRef}
          id="backButton"
          onClick={onBack} // Panggil fungsi onBack dari props index.js
          className="text-gray-600 hover:text-gray-800 italic disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isCapturing} // Disable jika sedang capture
        >
          &larr; Cancel & Return
        </button>
      </div>

      {/* Canvas Tersembunyi (untuk proses stitching) */}
      <canvas ref={canvasRef} id="hiddenCanvas" className="hidden"></canvas>
    </div>
  );
}

export default Photobooth;