import { useState } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import Gallery from '../components/Gallery'; // Impor komponen Gallery

// --- Impor Komponen Photobooth ---
// Kita load secara dinamis agar tidak error di server dan hanya load saat dibutuhkan
const DynamicPhotobooth = dynamic(() => import('../components/Photobooth'), {
  ssr: false, // Nonaktifkan Server-Side Rendering untuk komponen ini
  loading: () => <p className="text-center p-10 font-vintage-title animate-pulse">Memuat Kamera...</p> // Tampilkan pesan loading
});

// Komponen Modal dan Gallery bisa diimpor seperti biasa jika tidak perlu akses browser API saat load awal
// const IdeaModal = dynamic(() => import('../components/IdeaModal'), { ssr: false }); // Jika Anda ingin menambahkannya lagi


export default function Home() {
  // === STATE ===
  const [screen, setScreen] = useState('start'); // 'start', 'layout', 'text', 'camera'
  const [options, setOptions] = useState({
    mode: 'solo',
    layout: 'duo',
    photoCount: 2,
    filter: 'filter-vintage',
    stripColor: '#efebe9',
    text: ''
  });
  const [galleryPhotos, setGalleryPhotos] = useState([]); // Array untuk menyimpan URL foto hasil
  // const [showModal, setShowModal] = useState(false); // Hapus jika tidak pakai modal

  // === FUNGSI HANDLER ===
  function handleSelectMode(mode) {
    setOptions(prev => ({ ...prev, mode: mode }));
    setScreen('layout');
    // if (mode === 'ldr') { setShowModal(true); } // Hapus jika tidak pakai modal
  }

  function handleSelectLayout(layout, photoCount) {
    setOptions(prev => ({ ...prev, layout: layout, photoCount: photoCount }));
    setScreen('text');
  }

  function handleContinueToCamera() {
    setScreen('camera');
  }

  function handleBackTo(targetScreen) {
    setScreen(targetScreen);
    // Jika kembali dari kamera, pastikan komponen Photobooth di-unmount agar stream berhenti
  }

  function handleOptionChange(type, value) {
    setOptions(prev => ({ ...prev, [type]: value }));
  }

  // Fungsi ini dipanggil oleh Photobooth saat strip foto selesai dibuat
  function handlePhotoFinish(photoDataUrl) {
    console.log("Photo finished in index.js:", photoDataUrl.substring(0, 50) + "..."); // Log bahwa foto diterima
    setGalleryPhotos(prevPhotos => [photoDataUrl, ...prevPhotos]); // Tambah foto baru ke awal array galeri
    setScreen('start'); // Kembali ke layar awal (atau bisa ke 'gallery' jika ada layar khusus)
  }

  // === TAMPILAN (RENDER) ===
  return (
    <>
      <Head>
        <title>Photobooth LDR - Simple & Elegant Vintage</title>
      </Head>

      <div className="min-h-screen flex items-center justify-center p-4">
        {/* Kontainer Utama */}
        <div className="w-full max-w-6xl mx-auto bg-white bg-opacity-80 rounded-lg shadow-xl p-6 md:p-10 border border-gray-300 vignette-container">

          {/* === JUDUL === */}
          <header className="text-center mb-10">
            <h1 className="text-4xl md:text-6xl font-vintage-title mb-2">
                A Timeless Retrospection
            </h1>
            <p className="text-lg md:text-xl text-gray-700 tracking-wide mt-4 italic">
                Bridging the Miles with Fine Art Photography
            </p>
          </header>

          {/* === LAYAR UTAMA (KONTEN DINAMIS) === */}
          <main>

            {/* === 1. LAYAR MULAI === */}
            {screen === 'start' && (
              <div id="startScreen" className="text-center p-10 bg-white rounded-lg shadow-md border border-gray-200">
                <h2 className="text-2xl font-vintage-title text-gray-700 mb-2">✨Greetings, Esteemed Guest!✨</h2>
                <h1 className="text-3xl font-vintage-title text-gray-800 mb-8">Chapter One: Select Your Grand Presentation</h1>
                <p className="text-lg text-gray-600 mb-8">Pray tell, what scene shall we document this fine day?</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto mb-8">
                  <button onClick={() => handleSelectMode('solo')} className="card-choice text-center group">
                    <div className="card-choice-icon mb-4 transform transition-transform duration-300 group-hover:scale-110">👤</div>
                    <h3 className="card-choice-title mb-1">[A Portrait of Introspection]</h3>
                    <p className="text-gray-600">{"For a Solitary Grace. A refined token for your Beloved."}</p>
                  </button>
                  <button onClick={() => handleSelectMode('ldr')} className="card-choice text-center group">
                    <div className="card-choice-icon mb-4 transform transition-transform duration-300 group-hover:scale-110">🧑‍🤝‍🧑</div>
                    <h3 className="card-choice-title mb-2">[The Union of Two Souls]</h3>
                    <p className="text-gray-600">{"Unite your affection. Distance is but a mere jest in this frame."}</p>
                  </button>
                  
                </div>
        
                <div className="w-full h-px bg-[var(--color-taupe)] mt-12 mb-4"></div>
                <footer className="font-oldstandard text-sm opacity-60 mt-4">
                    *Please ensure the lighting is optimal for archival quality. Your cherished memories await.*
                </footer>
              </div>
            )}

            {/* === 2. LAYAR PILIHAN LAYOUT === */}
            {screen === 'layout' && (
              <div id="layoutScreen" className="text-center p-10 bg-white rounded-lg shadow-md border border-gray-200">
                <h1 className="text-3xl font-vintage-title text-gray-800 mb-8">Chapter Two: Select Your Grand Format</h1>
                <p className="text-lg text-gray-600 mb-8">All final records shall be rendered in portrait format at 1080x1350 pixels.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-8">
                  <button onClick={() => handleSelectLayout('polaroid', 1)} className="layout-choice group">
                    <div className="layout-preview"><div className="layout-preview-box"></div></div>
                    <h3 className="layout-choice-title">Polaroid</h3><p className="text-gray-600 text-sm">(1 Foto)</p>
                  </button>
                  <button onClick={() => handleSelectLayout('duo', 2)} className="layout-choice group">
                    <div className="layout-preview"><div className="layout-preview-box"></div><div className="layout-preview-box"></div></div>
                    <h3 className="layout-choice-title">Duo Strip</h3><p className="text-gray-600 text-sm">(2 Foto)</p>
                  </button>
                  <button onClick={() => handleSelectLayout('quad', 4)} className="layout-choice group">
                    <div className="layout-preview !flex-row !flex-wrap !p-2 !gap-2"><div className="layout-preview-box !w-[calc(50%-4px)] !h-[calc(50%-4px)] !m-0 !flex-grow-0"></div><div className="layout-preview-box !w-[calc(50%-4px)] !h-[calc(50%-4px)] !m-0 !flex-grow-0"></div><div className="layout-preview-box !w-[calc(50%-4px)] !h-[calc(50%-4px)] !m-0 !flex-grow-0"></div><div className="layout-preview-box !w-[calc(50%-4px)] !h-[calc(50%-4px)] !m-0 !flex-grow-0"></div></div>
                    <h3 className="layout-choice-title">Quad Grid</h3><p className="text-gray-600 text-sm">(4 Foto)</p>
                  </button>
                </div>
                <div className="text-center mt-4">
                  <button onClick={() => handleBackTo('start')} className="text-gray-600 hover:text-gray-800 italic">&larr; Return to Mode Selection</button>
                </div>
              </div>
            )}

            {/* === 3. LAYAR TEKS KUSTOM & OPSI === */}
            {screen === 'text' && (
              <div id="textScreen" className="p-10 bg-white rounded-lg shadow-md border border-gray-200">
                <h1 className="text-3xl font-vintage-title text-center text-gray-800 mb-8">Chapter Three: Customise Your Keepsake</h1>
                <div className="max-w-xl mx-auto">
                  {/* Pilihan Filter Foto */}
                  <div className="mb-6">
                    <h2 className="text-xl font-vintage-title text-gray-700 mb-3">Select Your Photographic Filter</h2>
                    <div id="filterOptions" className="flex flex-wrap gap-4">
                      <button onClick={() => handleOptionChange('filter', 'filter-vintage')} className={`option-button ${options.filter === 'filter-vintage' ? 'selected' : ''}`}>Vintage</button>
                      <button onClick={() => handleOptionChange('filter', 'filter-bw')} className={`option-button ${options.filter === 'filter-bw' ? 'selected' : ''}`}>B&W</button>
                      <button onClick={() => handleOptionChange('filter', 'filter-natural')} className={`option-button ${options.filter === 'filter-natural' ? 'selected' : ''}`}>Natural</button>
                    </div>
                  </div>
                  {/* Pilihan Warna Strip */}
                  <div className="mb-6">
                    <h2 className="text-xl font-vintage-title text-gray-700 mb-3">Choose Your Frame Colour</h2>
                    <div id="stripColorOptions" className="flex flex-wrap gap-4">
                      <button onClick={() => handleOptionChange('stripColor', '#efebe9')} className={`option-button ${options.stripColor === '#efebe9' ? 'selected' : ''}`}><span className="color-swatch" style={{backgroundColor: '#efebe9'}}></span>Krem</button>
                      <button onClick={() => handleOptionChange('stripColor', '#222222')} className={`option-button ${options.stripColor === '#222222' ? 'selected' : ''}`}><span className="color-swatch" style={{backgroundColor: '#222222'}}></span>Hitam</button>
                      <button onClick={() => handleOptionChange('stripColor', '#5d4037')} className={`option-button ${options.stripColor === '#5d4037' ? 'selected' : ''}`}><span className="color-swatch" style={{backgroundColor: '#5d4037'}}></span>Coklat</button>
                    </div>
                  </div>
                  {/* Input Teks Kustom */}
                  <div className="mb-8">
                    <h2 className="text-xl font-vintage-title text-gray-700 mb-3">Engrave Your Message (Optional)</h2>
                    <input type="text" id="customTextInput" className="vintage-input" placeholder="E.g., Missing You, My Dear! ❤️" maxLength="40" value={options.text} onChange={(e) => handleOptionChange('text', e.target.value)} />
                  </div>
                  <button onClick={handleContinueToCamera} className="btn-vintage-elegant w-full py-4 px-10 rounded-md text-lg">Proceed to the Chamber &rarr;</button>
                  <div className="text-center mt-6">
                    <button onClick={() => handleBackTo('layout')} className="text-gray-600 hover:text-gray-800 italic">&larr; Return to Format Selection</button>
                  </div>
                </div>
              </div>
            )}

            {/* === 4. LAYAR PHOTOBOOTH === */}
            {/* Tampilkan komponen Photobooth jika state 'screen' adalah 'camera' */}
            {screen === 'camera' && (
              <DynamicPhotobooth
                options={options} // Kirim state 'options' sebagai prop
                onBack={() => handleBackTo('text')} // Kirim fungsi 'handleBackTo' sebagai prop 'onBack'
                onFinish={handlePhotoFinish} // Kirim fungsi 'handlePhotoFinish' sebagai prop 'onFinish'
              />
            )}

          </main> {/* Akhir dari <main> */}

          {/* === 5. GALERI FOTO === */}
          {/* Tampilkan komponen Gallery di bawah main, kirim 'galleryPhotos' dari state */}
          <Gallery photos={galleryPhotos} />

        </div> {/* Akhir dari Kontainer Utama */}
      </div>
    </>
  );
}