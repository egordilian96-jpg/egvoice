import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
export default defineConfig({
  root: path.join(root, 'client'), plugins: [react()],
  resolve: { alias: {
    '@': path.join(root, 'client/src'), '@shared': path.join(root, 'shared'),
    'livekit-client': path.join(root, 'tests/livekit-fixture.ts'),
  } },
  server: { host: '0.0.0.0', port: 5175, fs: { allow: [root] } },
});
