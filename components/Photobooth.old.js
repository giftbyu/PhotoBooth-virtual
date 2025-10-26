import React, { useRef, useEffect, useState } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';

// Variabel di luar komponen agar tidak reset saat re-render
let socket;
let peer;
let reviewTimerInterval = null;
let reviewTimeoutId = null;

function Photobooth({ options, onBack, onFinish }) {
  const { mode, layout, photoCount, filter, stripColor, text } = options;

  // --- Refs ---
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const reviewCanvasRef = useRef(null);
  const videoContainerRef = useRef(null);
  const localVideoWrapperRef = useRef(null);
  const remoteVideoWrapperRef = useRef(null);
  const videoGridRef = useRef(null);
  const videoLabelsRef = useRef(null);
  const countdownOverlayRef = useRef(null);
  const reviewOverlayRef = useRef(null);
  const captureButtonRef = useRef(null);
  const backButtonRef = useRef(null);

  // --- State ---
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedFrames, setCapturedFrames] = useState([]);
  const [countdownText, setCountdownText] = useState('');
  const [showReview, setShowReview] = useState(false);
  const [reviewTimer, setReviewTimer] = useState(8);
  const [captureButtonText, setCaptureButtonText] = useState(`Take ${photoCount} Photo Strip`);
  const [isLdrConnected, setIsLdrConnected] = useState(false);
  const [error, setError] = useState(null);

  // --- Monitor state ---
  useEffect(() => {
    console.log("📊 showReview STATE CHANGED TO:", showReview);
  }, [showReview]);

  // --- Helper ---
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // --- Review Functions ---
  function cleanupReview(choice) {
    console.log("🧹 cleanupReview called with choice:", choice);
    if (reviewTimerInterval) clearInterval(reviewTimerInterval);
    if (reviewTimeoutId) clearTimeout(reviewTimeoutId);
    reviewTimerInterval = null;
    reviewTimeoutId = null;

    setShowReview(false);
    
    if (window.reviewResolve) {
        window.reviewResolve(choice);
        window.reviewResolve = null;
    }
  }

  function handleKeepPhoto() {
    console.log("✅ KEEP BUTTON CLICKED!");
    cleanupReview('keep');
  }

  function handleRetakePhoto() {
    console.log("🔄 RETAKE BUTTON CLICKED!");
    cleanupReview('retake');
  }

  function showReviewScreen(frameCanvas, duration) {
    console.log("=== showReviewScreen DIPANGGIL ===");
    console.log("frameCanvas:", frameCanvas);
    console.log("reviewOverlayRef.current:", reviewOverlayRef.current);
    console.log("reviewCanvasRef.current:", reviewCanvasRef.current);
    
    return new Promise((resolve) => {
        if (!reviewOverlayRef.current || !reviewCanvasRef.current) {
            console.error("❌ Review overlay elements not found");
            resolve('keep');
            return;
        }

        const reviewCtx = reviewCanvasRef.current.getContext('2d');
        if (reviewCtx) {
            reviewCanvasRef.current.width = frameCanvas.width;
            reviewCanvasRef.current.height = frameCanvas.height;
            reviewCtx.drawImage(frameCanvas, 0, 0);
            console.log("✅ Canvas drawn successfully");
        } else {
            console.error("❌ Failed to get review canvas context.");
            resolve('keep');
            return;
        }

        window.reviewResolve = resolve;
        
        console.log("🔄 Setting showReview to TRUE");
        setShowReview(true);
        
        console.log("⏰ Setting reviewTimer to:", duration);
        setReviewTimer(duration);

        if (reviewTimerInterval) clearInterval(reviewTimerInterval);
        reviewTimerInterval = setInterval(() => {
            setReviewTimer(prev => {
                const newVal = prev <= 1 ? 0 : prev - 1;
                console.log("⏱️ Timer:", newVal);
                if (newVal === 0) clearInterval(reviewTimerInterval);
                return newVal;
            });
        }, 1000);

        if (reviewTimeoutId) clearTimeout(reviewTimeoutId);
        reviewTimeoutId = setTimeout(() => {
            console.log("⏰ Review timeout, auto-keeping photo");
            cleanupReview('keep');
        }, duration * 1000);
        
        console.log("✅ showReviewScreen setup complete");
    });
  }

  // --- WebRTC Setup ---
  function setupLDRConnection(stream) {
      if (!stream) return;
      console.log("Setting up LDR Connection...");

      socket = io();

      const roomID = prompt("Masukkan Nama Room LDR (harus sama dengan pasangan):") || "default-room";
      if (!roomID) {
          setError("Nama Room LDR diperlukan.");
          onBack();
          return;
      }

      socket.emit('join-room', roomID);
      console.log(`Mencoba bergabung ke room: ${roomID}`);

      socket.on('user-joined', (userID) => {
          if (peer && !peer.destroyed) return;

          console.log(`User ${userID} bergabung.`);
          setIsLdrConnected(false);

          peer = new Peer({
              initiator: true,
              trickle: false,
              stream: stream,
          });

          peer.on('signal', (signal) => {
              socket.emit('offer', { userToSignal: userID, signal, callerID: socket.id });
          });

          peer.on('stream', (remoteStreamData) => {
              console.log("Menerima stream remote!");
              setRemoteStream(remoteStreamData);
              if (remoteVideoRef.current) {
                  remoteVideoRef.current.srcObject = remoteStreamData;
              }
              setIsLdrConnected(true);
          });

          peer.on('connect', () => {
              setIsLdrConnected(true);
          });

          peer.on('error', (err) => {
              console.error('Peer error:', err);
              setError("Koneksi LDR gagal.");
              setIsLdrConnected(false);
              if(peer) { peer.destroy(); peer = null; }
          });
          
          peer.on('close', () => {
              setRemoteStream(null);
              setIsLdrConnected(false);
              if(peer) { peer.destroy(); peer = null; }
          });
      });

      socket.on('offer-received', (payload) => {
           if (peer && !peer.destroyed) return;

          console.log("Menerima offer dari", payload.callerID);
          setIsLdrConnected(false);

          peer = new Peer({
              initiator: false,
              trickle: false,
              stream: stream,
          });

          peer.on('signal', (signal) => {
              socket.emit('answer', { signal, callerID: payload.callerID });
          });

          peer.signal(payload.signal);

          peer.on('stream', (remoteStreamData) => {
              console.log("Menerima stream remote!");
              setRemoteStream(remoteStreamData);
              if (remoteVideoRef.current) {
                  remoteVideoRef.current.srcObject = remoteStreamData;
              }
              setIsLdrConnected(true);
          });

          peer.on('connect', () => {
              setIsLdrConnected(true);
          });

          peer.on('error', (err) => {
              console.error('Peer error:', err);
              setError("Koneksi LDR gagal.");
              setIsLdrConnected(false);
              if(peer) { peer.destroy(); peer = null; }
          });
          
          peer.on('close', () => {
              setRemoteStream(null);
              setIsLdrConnected(false);
              if(peer) { peer.destroy(); peer = null; }
          });
      });

       socket.on('answer-received', (payload) => {
             if (peer && !peer.destroyed && !peer.connected && peer.initiator) {
                peer.signal(payload.signal);
             }
        });

       socket.on('user-disconnected', (userID) => {
            console.log(`User ${userID} disconnected.`);
            if (peer) {
                 peer.destroy();
                 peer = null;
                 setRemoteStream(null);
                 setIsLdrConnected(false);
            }
       });

      socket.on('disconnect', () => {
          setIsLdrConnected(false);
          if (peer) { peer.destroy(); peer = null; }
          setRemoteStream(null);
      });
  }

  // --- Camera Setup ---
  useEffect(() => {
    let currentStream = null;

    async function setupCameraAndConnection() {
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: mode === 'ldr',
        });
        currentStream = stream;
        setLocalStream(stream);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
           await localVideoRef.current.play().catch(e => console.error("Error playing local video:", e));
        }

        if (mode === 'ldr') {
          if (remoteVideoWrapperRef.current) remoteVideoWrapperRef.current.style.display = 'none';
          if (remoteVideoRef.current) remoteVideoRef.current.style.display = 'none';
          setupLDRConnection(stream);
        } else {
          setIsLdrConnected(true);
           if (remoteVideoWrapperRef.current) remoteVideoWrapperRef.current.classList.add('hidden');
        }

      } catch (err) {
        console.error("Error accessing camera:", err);
        setError("Kamera tidak dapat diakses.");
      }
    }

    setupCameraAndConnection();

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
       if (localVideoRef.current && localVideoRef.current.srcObject) {
         localVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
         localVideoRef.current.srcObject = null;
      }
      setLocalStream(null);
      setRemoteStream(null);

      if (peer) { peer.destroy(); peer = null; }
      if (socket) { socket.disconnect(); socket = null; }
      if (reviewTimerInterval) clearInterval(reviewTimerInterval);
      if (reviewTimeoutId) clearTimeout(reviewTimeoutId);
    };
  }, [mode]);

  // --- UI Adjustments ---
  useEffect(() => {
    if (localVideoRef.current) {
        localVideoRef.current.className = `scale-x-[-1] ${filter}`;
    }
    if (remoteVideoRef.current) {
        remoteVideoRef.current.className = filter;
    }

    let targetAspectClass = 'aspect-tall';
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

    if (videoGridRef.current && videoLabelsRef.current && remoteVideoWrapperRef.current) {
        if (mode === 'solo') {
            remoteVideoWrapperRef.current.classList.add('hidden');
            videoGridRef.current.classList.remove('md:grid-cols-2');
            videoGridRef.current.classList.add('grid-cols-1', 'max-w-md', 'mx-auto');
            videoLabelsRef.current.classList.add('hidden');
        } else {
            if (isLdrConnected && remoteStream) {
                 remoteVideoWrapperRef.current.classList.remove('hidden');
                 remoteVideoWrapperRef.current.style.display = '';
                 if(remoteVideoRef.current) remoteVideoRef.current.style.display = '';
            } else {
                 remoteVideoWrapperRef.current.classList.add('hidden');
                 remoteVideoWrapperRef.current.style.display = 'none';
                 if(remoteVideoRef.current) remoteVideoRef.current.style.display = 'none';
            }
            videoGridRef.current.classList.add('md:grid-cols-2');
            videoGridRef.current.classList.remove('grid-cols-1', 'max-w-md', 'mx-auto');
            videoLabelsRef.current.classList.remove('hidden');
             if(videoLabelsRef.current.children[1]) {
                videoLabelsRef.current.children[1].textContent = "Your partner";
            }
        }
    }

  }, [mode, layout, filter, isLdrConnected, remoteStream]);

  // --- Photo Capture Logic ---
  async function runCountdown(poseNumber) {
    if (countdownOverlayRef.current) countdownOverlayRef.current.classList.remove('hidden');
    setCountdownText(`Pose ke-${poseNumber}`);
    await sleep(1500);
    setCountdownText('3'); await sleep(1000);
    setCountdownText('2'); await sleep(1000);
    setCountdownText('1'); await sleep(1000);
    setCountdownText('Cheesee!!');
    if (videoContainerRef.current) videoContainerRef.current.classList.add('flash');
    await sleep(500);
    if (videoContainerRef.current) videoContainerRef.current.classList.remove('flash');
    if (countdownOverlayRef.current) countdownOverlayRef.current.classList.add('hidden');
    setCountdownText('');
    await sleep(500);
  }

   function captureCurrentFrame(forReview = false) {
       const poseNumber = capturedFrames.length + 1;

       let videoToUse = localVideoRef.current;
       let wrapper = localVideoWrapperRef.current;
       let isLocal = true;

       if (mode === 'ldr') {
           if (layout === 'quad' && (poseNumber === 2 || poseNumber === 4)) {
               videoToUse = remoteVideoRef.current;
               wrapper = remoteVideoWrapperRef.current;
               isLocal = false;
           } else if (layout !== 'quad') {
               return captureLDRFrame(forReview);
           }
       }

       if (!videoToUse || videoToUse.videoWidth === 0 || !wrapper) {
            console.error("Video not ready");
            setError("Video belum siap.");
            return null;
       }

       const rawW = videoToUse.videoWidth;
       const rawH = videoToUse.videoHeight;
       const rawRatio = rawW / rawH;

       let destRatio;
       if (wrapper.classList.contains('aspect-tall')) destRatio = 100 / 107;
       else if (wrapper.classList.contains('aspect-wide')) destRatio = 1000 / 515;
       else destRatio = rawRatio;

       let sX = 0, sY = 0, sW = rawW, sH = rawH;

       if (rawRatio > destRatio) {
           sH = rawH;
           sW = rawH * destRatio;
           sX = (rawW - sW) / 2;
           sY = 0;
       } else {
           sW = rawW;
           sH = rawW / destRatio;
           sX = 0;
           sY = (rawH - sH) / 2;
       }

       const tempCanvas = document.createElement('canvas');
       tempCanvas.width = sW;
       tempCanvas.height = sH;
       const tempCtx = tempCanvas.getContext('2d');
       if (!tempCtx) return null;

       tempCtx.filter = window.getComputedStyle(videoToUse).filter;

       if (isLocal) {
           tempCtx.save();
           tempCtx.scale(-1, 1);
           tempCtx.drawImage(videoToUse, sX, sY, sW, sH, -sW, 0, sW, sH);
           tempCtx.restore();
       } else {
           tempCtx.drawImage(videoToUse, sX, sY, sW, sH, 0, 0, sW, sH);
       }

       return tempCanvas;
   }

    function captureLDRFrame(forReview = false) {
        const localVid = localVideoRef.current;
        const remoteVid = remoteVideoRef.current;
        const localWrap = localVideoWrapperRef.current;

        if (!localVid || !remoteVid || localVid.videoWidth === 0 || remoteVid.videoWidth === 0 || !localWrap) {
             console.error("Video not ready (LDR)");
             setError("Partner video not ready.");
             return null;
        }

        const rawW = localVid.videoWidth;
        const rawH = localVid.videoHeight;

        let destRatioPerVideo;
        if (localWrap.classList.contains('aspect-tall')) destRatioPerVideo = 100 / 107;
        else if (localWrap.classList.contains('aspect-wide')) destRatioPerVideo = 1000 / 515;
        else destRatioPerVideo = rawW / rawH;

        let sX = 0, sY = 0, sW = rawW, sH = rawH;

        const rawRatioSingle = rawW / rawH;
        if (rawRatioSingle > destRatioPerVideo) {
            sH = rawH; sW = rawH * destRatioPerVideo; sX = (rawW - sW) / 2; sY = 0;
        } else {
            sW = rawW; sH = rawW / destRatioPerVideo; sX = 0; sY = (rawH - sH) / 2;
        }

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = sW * 2;
        tempCanvas.height = sH;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) return null;

        tempCtx.filter = window.getComputedStyle(localVid).filter;
        tempCtx.save();
        tempCtx.scale(-1, 1);
        tempCtx.drawImage(localVid, sX, sY, sW, sH, -sW, 0, sW, sH);
        tempCtx.restore();

        tempCtx.filter = window.getComputedStyle(remoteVid).filter;
        tempCtx.drawImage(remoteVid, sX, sY, sW, sH, sW, 0, sW, sH);

        return tempCanvas;
    }

    // --- Stitching ---
    function drawVintageStickers(ctx, areaX, areaY, areaWidth, areaHeight, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        const rand = (min, max) => Math.random() * (max - min) + min;
        
         ctx.save();
        ctx.translate(areaX + areaWidth - rand(30, 60), areaY + rand(30, 60));
        ctx.rotate(rand(-0.2, 0.2));
        ctx.beginPath();
        for (let i = 0; i < 5; i++) { ctx.lineTo(0, 15); ctx.translate(0, 15); ctx.rotate(Math.PI * 0.8); }
        ctx.closePath(); ctx.stroke(); ctx.restore();
        
         ctx.save();
        ctx.translate(areaX + rand(30, 60), areaY + areaHeight / 2 + rand(-30, 30));
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(20, 10); ctx.lineTo(0, 20); ctx.lineTo(20, 30);
        ctx.stroke(); ctx.restore();
    }

     function drawBranding(ctx, x, y, width, color, customTextValue, defaultText) {
        const textToDraw = customTextValue || defaultText || 'Memories in Bloom';
        let fontSize = 60;
        
        if (defaultText === "Memories in Bloom" && !customTextValue) {
             ctx.font = `bold ${fontSize}px "Playfair Display"`;
        } else {
             ctx.font = `italic ${fontSize}px "Lora"`;
             fontSize = 45;
             ctx.font = `italic ${fontSize}px "Lora"`;
        }
        
        while (ctx.measureText(textToDraw).width > width - 40 && fontSize > 20) {
            fontSize--;
             if (defaultText === "Memories in Bloom" && !customTextValue) { ctx.font = `bold ${fontSize}px "Playfair Display"`; }
             else { ctx.font = `italic ${fontSize}px "Lora"`; }
        }
        ctx.textAlign = 'center';
        ctx.fillStyle = color;
        ctx.fillText(textToDraw, x + width / 2, y);
    }

    function drawImageWithCover(ctx, imgCanvas, x, y, w, h) {
         if(!imgCanvas) {
            ctx.fillStyle = "#cccccc";
            ctx.fillRect(x, y, w, h);
            return;
         };
        ctx.drawImage(imgCanvas, x, y, w, h);
    }

   async function stitchFrames(capturedCanvases) {
       const images = capturedCanvases;
       if (images.length === 0 || !canvasRef.current) return null;

       const finalCanvas = canvasRef.current;
       const finalCtx = finalCanvas.getContext('2d');
       if (!finalCtx) return null;

       const STRIP_WIDTH = 1080;
       const STRIP_HEIGHT = 1350;
       const PADDING = 40;
       const HEADER_HEIGHT = 150;
       const FOOTER_HEIGHT = 200;

       finalCanvas.width = STRIP_WIDTH;
       finalCanvas.height = STRIP_HEIGHT;
       finalCtx.filter = 'none';

       let textColor, stickerColor;
       if (stripColor === '#efebe9') {
           textColor = '#5d4037'; stickerColor = '#8d6e63';
       } else {
           textColor = '#f5f5dc'; stickerColor = '#a1887f';
       }

       finalCtx.fillStyle = stripColor;
       finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

        const headerY = 90;
        drawBranding(finalCtx, 0, headerY, STRIP_WIDTH, textColor, "Memories in Bloom", "Memories in Bloom");

        const footerY = STRIP_HEIGHT - (FOOTER_HEIGHT / 2) + 0;
        drawBranding(finalCtx, 0, footerY, STRIP_WIDTH, textColor, text, "");

       const frameAreaX = PADDING;
       const frameAreaY = HEADER_HEIGHT;
       const frameAreaWidth = STRIP_WIDTH - PADDING * 2;
       const frameAreaHeight = STRIP_HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT;

        drawVintageStickers(finalCtx, frameAreaX, frameAreaY, frameAreaWidth, frameAreaHeight, stickerColor);

       switch (layout) {
           case 'polaroid': {
               const frameHeight = frameAreaHeight;
               drawImageWithCover(finalCtx, images[0], frameAreaX, frameAreaY, frameAreaWidth, frameHeight);
               break;
           }
           case 'duo': {
               const frameInnerPadding = 40;
               const frameHeight = (frameAreaHeight - frameInnerPadding) / 2;
               drawImageWithCover(finalCtx, images[0], frameAreaX, frameAreaY, frameAreaWidth, frameHeight);
               drawImageWithCover(finalCtx, images[1], frameAreaX, frameAreaY + frameHeight + frameInnerPadding, frameAreaWidth, frameHeight);
               break;
           }
           case 'quad': {
               const frameInnerPadding = 40;
               const frameWidth = (frameAreaWidth - frameInnerPadding) / 2;
               const frameHeight = (frameAreaHeight - frameInnerPadding) / 2;

               drawImageWithCover(finalCtx, images[0], frameAreaX, frameAreaY, frameWidth, frameHeight);
               drawImageWithCover(finalCtx, images[1], frameAreaX + frameWidth + frameInnerPadding, frameAreaY, frameWidth, frameHeight);
               drawImageWithCover(finalCtx, images[2], frameAreaX, frameAreaY + frameHeight + frameInnerPadding, frameWidth, frameHeight);
               drawImageWithCover(finalCtx, images[3], frameAreaX + frameWidth + frameInnerPadding, frameAreaY + frameHeight + frameInnerPadding, frameWidth, frameHeight);
               break;
           }
            default:
                console.error("Layout tidak dikenal:", layout);
       }
       return finalCanvas.toDataURL('image/png');
   }

   // --- Main Sequence ---
   async function startPhotoStripSequence() {
     console.log("🎬 startPhotoStripSequence DIMULAI");
     if (mode === 'ldr' && !isLdrConnected) {
       alert("Waiting for the pair to connect...");
       return;
     }
       setIsCapturing(true);
       if (backButtonRef.current) backButtonRef.current.classList.add('hidden');
       setCapturedFrames([]);

       let currentStripFrames = [];

       while (currentStripFrames.length < photoCount) {
           const poseNumber = currentStripFrames.length + 1;
           console.log(`📸 Mengambil foto ke-${poseNumber}`);

           await runCountdown(poseNumber);

           const frameCanvas = captureCurrentFrame(true);

            if (!frameCanvas) {
                console.error("Capture failed for pose", poseNumber);
                setError("Failed to take a picture.");
                setIsCapturing(false);
                if (backButtonRef.current) backButtonRef.current.classList.remove('hidden');
                return;
            }

           console.log("🔍 Memanggil showReviewScreen...");
           const userChoice = await showReviewScreen(frameCanvas, 8);
           console.log("👤 User choice:", userChoice);

           if (userChoice === 'keep') {
               currentStripFrames.push(frameCanvas);
               console.log(`✅ Foto ke-${poseNumber} disimpan. Total: ${currentStripFrames.length}`);
           } else {
               console.log(`🔄 Foto ke-${poseNumber} diambil ulang`);
           }
       }

       console.log("🖨️ Mencetak strip...");
       setCountdownText('Mencetak...');
       if (countdownOverlayRef.current) countdownOverlayRef.current.classList.remove('hidden');

       const finalStripUrl = await stitchFrames(currentStripFrames);

       if (countdownOverlayRef.current) countdownOverlayRef.current.classList.add('hidden');
       setCountdownText('');

       if (finalStripUrl) {
           console.log("✅ Strip selesai!");
           onFinish(finalStripUrl);
       } else {
            console.error("❌ Stitching failed.");
            setError("Gagal membuat strip foto.");
       }

       setIsCapturing(false);
       if (backButtonRef.current) backButtonRef.current.classList.remove('hidden');
   }

  // === RENDER JSX ===
  return (
    <div id="photoboothScreen">
      {error && <p className="text-red-600 text-center mb-4 p-2 bg-red-100 border border-red-400 rounded">{error}</p>}

      <div ref={videoContainerRef} className="bg-gray-200 p-4 rounded-lg shadow-md mb-6 relative border border-gray-300">
        <div ref={videoGridRef} id="videoGrid" className="grid grid-cols-1 gap-4 shadow-inner rounded-md overflow-hidden p-2 bg-gray-300">

          <div ref={localVideoWrapperRef} id="localVideoWrapper" className="video-wrapper">
            <video ref={localVideoRef} id="localVideo" autoPlay playsInline muted className={`scale-x-[-1] ${filter}`}></video>
          </div>

          <div ref={remoteVideoWrapperRef} id="remoteVideoWrapper" className="video-wrapper">
             {mode === 'ldr' && !isLdrConnected && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-700 text-white italic text-center p-4">
                    Waiting for your partner to join...<br/>Ensure the room name is the same.
                </div>
              )}
            <video ref={remoteVideoRef} id="remoteVideo" autoPlay playsInline className={filter}></video>
          </div>
        </div>

        {countdownText && (
          <div ref={countdownOverlayRef} id="countdownOverlay" className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-20 rounded-lg">
            <h2 className="text-white text-7xl md:text-9xl font-bold text-center" style={{ fontFamily: "'Playfair Display', serif", textShadow: "2px 2px 8px rgba(0,0,0,0.7)" }}>
              {countdownText}
            </h2>
          </div>
        )}

        {/* PERBAIKAN: Render selalu, sembunyikan dengan class hidden */}
        <div 
          ref={reviewOverlayRef} 
          className={`absolute inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center z-30 rounded-lg p-4 ${showReview ? '' : 'hidden'}`}
        >
           <h2 className="text-white text-3xl font-bold mb-4" style={{ fontFamily: "'Playfair Display', serif", textShadow: "1px 1px 4px rgba(0,0,0,0.5)" }}>
             Photo Preview
           </h2>
           <canvas ref={reviewCanvasRef} className="w-auto h-3/5 max-w-full rounded-md border-4 border-white shadow-lg bg-gray-500"></canvas>
           <div className="flex gap-4 mt-6">
               <button 
                   onClick={handleRetakePhoto}
                   className="btn-vintage-secondary-elegant bg-white text-gray-800 py-3 px-6 rounded-md text-lg hover:bg-gray-100 transition-colors"
               >
                   Retake
               </button>
               <button 
                   onClick={handleKeepPhoto}
                   className="btn-vintage-elegant py-3 px-6 rounded-md text-lg"
               >
                   Save & Continue
               </button>
           </div>
           <p className="text-white text-lg mt-4">Continue in {reviewTimer}...</p>
        </div>
      </div>

      <div ref={videoLabelsRef} id="videoLabels" className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 -mt-4 px-4 text-center text-gray-700 italic">
        <p>You</p>
        <p>Your Partner</p>
      </div>

      <div className="text-center">
        <button
          ref={captureButtonRef}
          id="captureButton"
          className="btn-vintage-elegant py-5 px-12 rounded-full text-xl flex items-center justify-center mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={startPhotoStripSequence}
          disabled={isCapturing || (mode === 'ldr' && !isLdrConnected)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>{captureButtonText}</span>
        </button>
      </div>

      <div className="text-center mt-4">
        <button
          ref={backButtonRef}
          onClick={onBack}
          className="text-gray-600 hover:text-gray-800 italic disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isCapturing}
        >
          &larr; Cancel & Return
        </button>
      </div>

      <canvas ref={canvasRef} id="hiddenCanvas" className="hidden"></canvas>
    </div>
  );
}

export default Photobooth;