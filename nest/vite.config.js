import { defineConfig } from 'vite';

// itch.io 업로드용: dist/ 안의 파일들이 상대 경로로 서로를 찾도록 base 를 './' 로 둔다.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
  },
});
