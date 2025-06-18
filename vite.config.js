import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify('1.0.0')
  }
});