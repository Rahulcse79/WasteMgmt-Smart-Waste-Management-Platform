import { AuthService } from '../../src/services/auth.service.js';
import { DustbinModel } from '../../src/models/Dustbin.js';

/** Create an admin and a regular user with strong passwords. Returns plain creds. */
export async function seedAdminAndUser(): Promise<{
  admin: { username: string; password: string };
  user: { username: string; password: string; assignedDustbins: string[] };
}> {
  const admin = { username: 'admintest', password: 'AdminPass#2026X' };
  const user = {
    username: 'usertest',
    password: 'UserPass#2026X',
    assignedDustbins: ['BIN-A1', 'BIN-A2'],
  };
  await AuthService.createUser({ ...admin, role: 'admin' });
  await AuthService.createUser({
    ...user,
    role: 'user',
    assignedDustbins: user.assignedDustbins,
  });
  return { admin, user };
}

interface SeedDustbinInput {
  dustbinId: string;
  dustbinName?: string;
  zone?: string;
  latitude: number;
  longitude: number;
  fill?: number;
}

export async function seedDustbins(items: SeedDustbinInput[]) {
  const docs = await DustbinModel.insertMany(
    items.map((i) => ({
      dustbinId: i.dustbinId,
      dustbinName: i.dustbinName ?? i.dustbinId,
      zone: i.zone ?? '',
      latitude: i.latitude,
      longitude: i.longitude,
      latest: { depth: i.fill ?? 0, timestamp: new Date() },
      online: true,
    }))
  );
  return docs;
}
