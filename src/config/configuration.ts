/**
 * Application configuration
 */
export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  jwt: {
    publicKeyPath: process.env.JWT_PUBLIC_KEY_PATH || './keys/public.pem',
    privateKeyPath: process.env.JWT_PRIVATE_KEY_PATH || './keys/private.pem',
    expiration: process.env.JWT_EXPIRATION || '1h',
    issuer: process.env.JWT_ISSUER || 'peersync-dev-connect',
    audience: process.env.JWT_AUDIENCE || 'peersync-clients',
  },

  ws: {
    path: process.env.WS_PATH || '/ws',
    heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000', 10),
  },
});
