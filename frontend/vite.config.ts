import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // In dev the page connects straight to the backend on :3030 (see WS_URL in App.tsx).
  plugins: [react()],
});
