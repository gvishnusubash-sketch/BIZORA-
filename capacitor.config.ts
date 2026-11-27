import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bizora.app',
  appName: 'BIZORA',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
