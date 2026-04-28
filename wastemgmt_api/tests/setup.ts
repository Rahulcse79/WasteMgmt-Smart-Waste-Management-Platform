/**
 * Global test bootstrap — runs once before any test file.
 *
 * Provides:
 *   - All env vars the production schema (`config.ts`) requires, before
 *     anything imports `config`.
 *   - An in-memory MongoDB instance shared across the suite.
 *   - Per-test DB cleanup via `beforeEach` so tests stay independent.
 */
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// — Env: must be set BEFORE the production code reads it.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'fatal';
process.env.MONGODB_URI = 'mongodb://placeholder/will-be-replaced';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(48);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(48);
process.env.PAYLOAD_ENC_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.RATE_LIMIT_MAX = '10000';
process.env.MQTT_ENABLED = 'false';
process.env.SEED_ADMIN_PASSWORD = 'TestAdmin#2026';
process.env.SEED_USER_PASSWORD = 'TestUser#2026';

let mongo: MongoMemoryServer | undefined;

beforeAll(async () => {
  // Bump start timeout — slow first-spawn on macOS / cold caches occasionally
  // exceeds the default 10s and produces flaky "Instance failed to start" errors.
  mongo = await MongoMemoryServer.create({
    instance: { launchTimeout: 60_000 },
  });
  await mongoose.connect(mongo.getUri());
});

beforeEach(async () => {
  if (mongoose.connection.readyState === 1) {
    const collections = await mongoose.connection.db!.collections();
    // Skip system.* collections (e.g. system.views) — they are not user-writable.
    const userCollections = collections.filter((c) => !c.collectionName.startsWith('system.'));
    await Promise.all(userCollections.map((c) => c.deleteMany({})));
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
