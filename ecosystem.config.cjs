// Cấu hình pm2 khi chạy trên VPS:  pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'market-monitoring',
      script: 'dist/index.js',
      cwd: __dirname,
      instances: 1, // CHỈ 1 instance: lịch cào & SQLite không nên chạy song song
      autorestart: true,
      max_memory_restart: '400M',
      env: { NODE_ENV: 'production' },
      time: true,
    },
  ],
};
