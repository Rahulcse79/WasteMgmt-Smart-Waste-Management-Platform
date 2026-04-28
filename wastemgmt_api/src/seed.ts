import { config } from './config.js';
import { connectDB, disconnectDB } from './db.js';
import { logger } from './logger.js';
import { UserModel } from './models/User.js';
import { AuthService } from './services/auth.service.js';

/**
 * Idempotent seeder. Creates default `admin/admin` and `user/user` accounts on
 * an empty users collection. Safe to run on every boot.
 */
export async function runSeed(): Promise<void> {
  const count = await UserModel.countDocuments();
  if (count > 0) {
    logger.info({ count }, '🌱 Seed skipped (users already exist)');
    return;
  }
  await AuthService.createUser({
    username: config.SEED_ADMIN_USERNAME,
    password: config.SEED_ADMIN_PASSWORD,
    role: 'admin',
  });
  await AuthService.createUser({
    username: config.SEED_USER_USERNAME,
    password: config.SEED_USER_PASSWORD,
    role: 'user',
  });
  logger.warn(
    `🌱 Seeded default accounts: ${config.SEED_ADMIN_USERNAME}/${config.SEED_ADMIN_PASSWORD} and ${config.SEED_USER_USERNAME}/${config.SEED_USER_PASSWORD} — CHANGE THESE IMMEDIATELY`
  );
}

// Allow `npm run seed` standalone
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    await connectDB();
    await runSeed();
    await disconnectDB();
    process.exit(0);
  })().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
