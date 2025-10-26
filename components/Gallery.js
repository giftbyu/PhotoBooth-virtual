// components/Gallery.js
import React from 'react';

// Komponen Gallery menerima 'photos' (array berisi URL gambar) sebagai prop
function Gallery({ photos }) {
  // Jika belum ada foto, jangan tampilkan apa-apa (atau tampilkan pesan)
  if (!photos || photos.length === 0) {
    return null; // Atau <p>Belum ada foto di galeri.</p>
  }

  return (
    // Salin struktur HTML #gallerySection Anda ke sini
    // Ganti 'class' -> 'className'
    <div id="gallerySection" className="mt-12 p-8 bg-white rounded-lg shadow-md border border-gray-200">
      <h2 className="text-2xl md:text-3xl font-vintage-title text-center mb-8">
        Your Memory Gallery 📸
      </h2>

      {/* Ganti #galleryContainer dengan div ini */}
      {/* Kita akan me-render (looping) foto dari state 'photos' */}
      <div id="galleryContainer" className="grid grid-cols-2 sm:grid-cols-3 gap-6">
        {photos.map((photoUrl, index) => (
          // Setiap foto akan dirender seperti ini
          // Kita gunakan 'key' unik untuk setiap elemen dalam loop
          <div key={index} className="relative rounded-lg overflow-hidden shadow-xl bg-white vintage-elegant-frame-gallery group">
            <img
              src={photoUrl}
              alt={`Hasil Foto ${index + 1}`}
              className="w-full h-full object-cover absolute top-0 left-0"
            />
            
            {/* Tombol Download (seperti di HTML Anda) */}
            <a
              href={photoUrl}
              download={`Photobooth_Strip_${index + 1}.png`}
              className="absolute top-2 right-2 bg-gray-900 bg-opacity-30 text-white p-2 rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform hover:scale-110"
              title="Download Foto" // Tambahkan tooltip
            >
              {/* Salin SVG ikon download */}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.07a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </a>
            
            {/* Area Caption (Kosong, tanpa tombol Gemini) */}
            {/* Kita tetap buat div-nya agar layout sama */}
            <div className="caption-display">
                {/* Kosong */}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Gallery;