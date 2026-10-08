require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  otpDevMode: process.env.OTP_DEV_MODE === 'true',
  smsProvider: process.env.SMS_PROVIDER || 'none',
  msg91: { authKey: process.env.MSG91_AUTH_KEY, templateId: process.env.MSG91_TEMPLATE_ID },
  autoMigrate: process.env.AUTO_MIGRATE !== 'false',
  retentionDays: Number(process.env.LOCATION_RETENTION_DAYS || 90),
  brand: { app: 'Saathi', company: 'Devnale Globals' },
  adminKey: process.env.ADMIN_KEY || '',
  // Optional: switch map provider without code changes (e.g. MapTiler with your key)
  map: { tileUrl: process.env.MAP_TILE_URL || '', attribution: process.env.MAP_ATTRIBUTION || '' },
  // App download settings (change in Render > Environment, no code change needed)
  download: {
    apkUrl: process.env.APK_URL || '',              // e.g. GitHub Release asset link. Empty = serve web/downloads/saathi.apk
    version: process.env.APP_VERSION || '1.0.0',
    sizeMb: process.env.APK_SIZE_MB || '',
    iosUrl: process.env.IOS_URL || '',              // App Store / TestFlight link when ready
    playStoreUrl: process.env.PLAY_STORE_URL || '', // when published on Play Store
    minVersion: process.env.APP_MIN_VERSION || '',   // apps older than this must update
    notes: process.env.APP_RELEASE_NOTES || '',      // shown in the app's update banner
  },
};
