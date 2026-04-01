import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  const isMobileBuild = mode === 'mobile';
  const isDevServer = command === 'serve';

  return {
    base: isDevServer ? '/' : isMobileBuild ? './' : '/stick-to-gif/',
    plugins: [react()],
  };
});
