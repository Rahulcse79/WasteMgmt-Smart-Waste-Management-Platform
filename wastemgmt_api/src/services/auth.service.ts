import { createHash, randomBytes } from 'crypto';
import { UserModel, type UserDoc } from '../models/User.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { encryptString } from '../utils/crypto.js';
import { config } from '../config.js';

export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

const encPassword = (plain: string): string => encryptString(plain, config.PAYLOAD_ENC_KEY);

export class AuthService {
  static async findActiveByUsername(username: string): Promise<UserDoc | null> {
    return UserModel.findOne({ username: username.toLowerCase(), isActive: true });
  }

  static async createUser(input: {
    username: string;
    password: string;
    role: 'admin' | 'user';
    email?: string;
    assignedDustbins?: string[];
  }): Promise<UserDoc> {
    const passwordHash = await hashPassword(input.password);
    return UserModel.create({
      username: input.username.toLowerCase(),
      email: input.email ?? '',
      passwordHash,
      passwordEnc: encPassword(input.password),
      role: input.role,
      assignedDustbins: input.assignedDustbins ?? [],
    });
  }

  static async verifyLogin(username: string, password: string): Promise<UserDoc | null> {
    const user = await this.findActiveByUsername(username);
    if (!user) return null;
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return null;
    // Lazy backfill: existing accounts created before passwordEnc existed.
    if (!user.passwordEnc) {
      user.passwordEnc = encPassword(password);
      await user.save();
    }
    return user;
  }

  /** Persist hashed refresh token (rotation): only the hash leaves memory. */
  static async setRefreshToken(userId: string, token: string | null): Promise<void> {
    await UserModel.updateOne(
      { _id: userId },
      { $set: { refreshTokenHash: token ? sha256(token) : null, lastLoginAt: new Date() } }
    );
  }

  static async refreshTokenMatches(userId: string, token: string): Promise<boolean> {
    const u = await UserModel.findById(userId).select('refreshTokenHash').lean();
    return !!u?.refreshTokenHash && u.refreshTokenHash === sha256(token);
  }

  static async resetPassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await hashPassword(newPassword);
    await UserModel.updateOne(
      { _id: userId },
      { $set: { passwordHash, passwordEnc: encPassword(newPassword), refreshTokenHash: null } }
    );
  }

  /** Self-service: verify current password before changing it. */
  static async changeOwnPassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<{ ok: boolean; user?: UserDoc; reason?: string }> {
    const user = await UserModel.findById(userId);
    if (!user || !user.isActive) return { ok: false, reason: 'not_found' };
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) return { ok: false, reason: 'bad_password' };
    user.passwordHash = await hashPassword(newPassword);
    user.passwordEnc = encPassword(newPassword);
    user.refreshTokenHash = null;
    await user.save();
    return { ok: true, user };
  }

  /** Self-service: update email on the caller's own account. */
  static async updateOwnEmail(userId: string, email: string): Promise<UserDoc | null> {
    const user = await UserModel.findById(userId);
    if (!user || !user.isActive) return null;
    user.email = email.toLowerCase();
    await user.save();
    return user;
  }

  static randomPassword(): string {
    return randomBytes(9).toString('base64url');
  }
}
