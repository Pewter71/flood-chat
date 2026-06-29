import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'cobertura'],
      include: ['src/**/*.{js,jsx}'],
      exclude: [
        'node_modules/',
        'src/setupTests.js',
        'src/index.jsx',  // Исключаем entry point
        'src/**/*.test.{js,jsx}',
        'src/**/*.spec.{js,jsx}'
      ],
      all: true,
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    watch: {
      usePolling: true
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          socket: ['socket.io-client']
        }
      }
    }
  }
});
