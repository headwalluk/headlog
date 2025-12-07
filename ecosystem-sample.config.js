module.exports = {
  apps: [
    {
      name: 'headlog',
      script: './src/server.js',
      instances: 'max', // Use all CPU cores (or specify a number like 4)
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production'
        // PORT: 3010,
        // HOST: '0.0.0.0',
        // LOG_LEVEL: 'info'
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      time: true,
      max_memory_restart: '500M',
      wait_ready: true,
      listen_timeout: 10000,

      // Restart settings
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      // Watch mode (disable in production)
      watch: false,

      // Environment-specific settings
      env_production: {
        NODE_ENV: 'production'
      },
      env_staging: {
        NODE_ENV: 'staging'
      }
    }
  ]
};
