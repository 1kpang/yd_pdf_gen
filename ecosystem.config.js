module.exports = {
  apps: [
    {
      name: 'gen-pdf',
      script: 'app.js',
      instances: 4, // Specify the number of instances
      exec_mode: 'cluster', // Use cluster mode for load balancing
      env: {
        NODE_ENV: 'production',
        OPENSSL_CONF: '/etc/ssl'
      },
      env_development: {
        NODE_ENV: 'development',
        OPENSSL_CONF: '/etc/ssl'
      },
      env_test: {
        NODE_ENV: 'test',
        OPENSSL_CONF: '/etc/ssl'
      }
    }
  ]
};