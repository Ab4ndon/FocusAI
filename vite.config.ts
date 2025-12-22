import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY), // 兼容旧变量
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.DASHSCOPE_API_KEY': JSON.stringify(env.DASHSCOPE_API_KEY),
        'process.env.DASHSCOPE_BASE_URL': JSON.stringify(env.DASHSCOPE_BASE_URL),
        'process.env.QWEN_VL_MODEL': JSON.stringify(env.QWEN_VL_MODEL),
        'process.env.QWEN_TEXT_MODEL': JSON.stringify(env.QWEN_TEXT_MODEL),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
