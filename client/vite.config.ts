import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Faster / lower memory than trying to minify giant OCR WASM into the app bundle.
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/tesseract.js')) return 'ocr-tesseract';
          if (id.includes('node_modules/pdfjs-dist')) return 'ocr-pdf';
          if (id.includes('node_modules/html5-qrcode')) return 'vendor-qr';
          if (id.includes('node_modules/react-dom')) return 'vendor-react';
          if (id.includes('node_modules/react-router')) return 'vendor-router';
          if (id.includes('node_modules/react/')) return 'vendor-react';
        },
      },
    },
  },
  optimizeDeps: {
    // Keep heavy OCR/PDF out of the prebundle graph when possible.
    exclude: ['tesseract.js', 'tesseract.js-core', 'pdfjs-dist'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
