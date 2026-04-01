import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const isMobileBuild = mode === 'mobile';

  return {
    base: isMobileBuild ? './' : '/stick-to-gif/',
    plugins: [react()],
  };
});
