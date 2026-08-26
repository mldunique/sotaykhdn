import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,
    proxy: {
      // Chuyển hướng các request bắt đầu bằng /api sang server backend
      '/api': {
        target: 'http://localhost:8082', // Local DEV
        // target: 'http://10.0.175.10:8082', // UAT IP
        changeOrigin: true,
        secure: false,
      },
      // Chuyển hướng các request bắt đầu bằng /files sang server backend để lấy ảnh
      '/files': {
        target: 'http://localhost:8082', // Local DEV
        // target: 'http://10.0.175.10:8082', // UAT IP
        changeOrigin: true,
        secure: false,
      }
    }
  },
  // THÊM ĐOẠN BUILD DƯỚI ĐÂY
  build: {
    chunkSizeWarningLimit: 1000, // Nâng giới hạn cảnh báo lên 1000 kB (1MB)
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Tách các thư viện node_modules ra file vendor riêng để tối ưu cache và giảm tải file chính
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        }
      }
    }
  }
})