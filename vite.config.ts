import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/stick-to-gif/',
  plugins: [react()],
});
