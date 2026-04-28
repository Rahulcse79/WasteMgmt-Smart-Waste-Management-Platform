import mongoose from 'mongoose';
import { config } from './config.js';
import { logger } from './logger.js';

mongoose.set('strictQuery', true);

export async function connectDB(): Promise<void> {
  mongoose.connection.on('connected', () => logger.info('🗄️  MongoDB connected'));
  mongoose.connection.on('disconnected', () => logger.warn('🗄️  MongoDB disconnected'));
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB error'));

  await mongoose.connect(config.MONGODB_URI, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 50,
    minPoolSize: 5,
    retryWrites: true,
  });
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
