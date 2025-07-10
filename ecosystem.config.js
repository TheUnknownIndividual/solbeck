module.exports = {
  apps: [{
    name: 'solbot',
    script: 'telebot.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    restart_delay: 5000, // 5 second delay before restart
    max_restarts: 10, // Maximum number of restarts
    min_uptime: '10s', // Minimum uptime before restart
    kill_timeout: 10000, // 10 seconds to kill process gracefully
    // Remove automatic cron restart to prevent conflicts
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};