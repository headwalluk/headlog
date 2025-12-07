module.exports = {
  apps: [
    {
      name: 'headlog',
      script: './src/server.js',
      instances: 'max', // Use all CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      time: true,
      max_memory_restart: '500M',
      wait_ready: true,
      listen_timeout: 10000
    }
  ]
};
