import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { AuthService } from '../services/auth.service.js';
import { AuditService } from '../services/audit.service.js';
import { EmailService } from '../services/email.service.js';
import { UserModel } from '../models/User.js';
import { decryptPayload } from '../utils/crypto.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { passwordSchema } from '../utils/passwordPolicy.js';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

const LoginSchema = z.object({
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  /** Optionally encrypted payload: AES-256-GCM token of `{username,password}`. */
  payload: z.string().optional(),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/auth/login',
    { preHandler: validateBody(LoginSchema) },
    async (req, reply) => {
      const body = req.body as z.infer<typeof LoginSchema>;
      let username = body.username;
      let password = body.password;

      if (body.payload) {
        try {
          const dec = decryptPayload<{ username: string; password: string }>(
            body.payload,
            config.PAYLOAD_ENC_KEY
          );
          username = dec.username;
          password = dec.password;
        } catch {
          return reply.code(400).send({ error: 'Bad encrypted payload' });
        }
      }

      if (!username || !password) {
        return reply.code(400).send({ error: 'username and password required' });
      }

      const user = await AuthService.verifyLogin(username, password);
      if (!user) {
        await AuditService.log({
          action: 'LOGIN_FAILED',
          resource: 'auth',
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { username },
        });
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      const accessToken = await reply.jwtSign(
        { sub: user.id, username: user.username, role: user.role, type: 'access' },
        { sign: { expiresIn: config.JWT_ACCESS_TTL, key: config.JWT_ACCESS_SECRET } }
      );
      const refreshToken = jwt.sign(
        { sub: user.id, username: user.username, role: user.role, type: 'refresh' },
        config.JWT_REFRESH_SECRET,
        { expiresIn: config.JWT_REFRESH_TTL as jwt.SignOptions['expiresIn'], jwtid: randomUUID() }
      );
      await AuthService.setRefreshToken(user.id, refreshToken);

      await AuditService.log({
        actor: { sub: user.id, username: user.username, role: user.role, type: 'access' },
        action: 'LOGIN_SUCCESS',
        resource: 'auth',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          email: user.email,
          assignedDustbins: user.assignedDustbins,
        },
      };
    }
  );

  app.post(
    '/auth/refresh',
    { preHandler: validateBody(RefreshSchema) },
    async (req, reply) => {
      const { refreshToken } = req.body as z.infer<typeof RefreshSchema>;
      try {
        const decoded = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET) as { sub: string; username: string; role: 'admin' | 'user'; type: string };
        if (decoded.type !== 'refresh') return reply.code(401).send({ error: 'Bad token type' });
        const matches = await AuthService.refreshTokenMatches(decoded.sub, refreshToken);
        if (!matches) return reply.code(401).send({ error: 'Refresh token revoked' });

        const accessToken = await reply.jwtSign(
          { sub: decoded.sub, username: decoded.username, role: decoded.role, type: 'access' },
          { sign: { expiresIn: config.JWT_ACCESS_TTL, key: config.JWT_ACCESS_SECRET } }
        );
        const newRefresh = jwt.sign(
          { sub: decoded.sub, username: decoded.username, role: decoded.role, type: 'refresh' },
          config.JWT_REFRESH_SECRET,
          { expiresIn: config.JWT_REFRESH_TTL as jwt.SignOptions['expiresIn'], jwtid: randomUUID() }
        );
        await AuthService.setRefreshToken(decoded.sub, newRefresh);

        return { accessToken, refreshToken: newRefresh };
      } catch {
        return reply.code(401).send({ error: 'Invalid refresh token' });
      }
    }
  );

  app.post('/auth/logout', { preHandler: requireAuth }, async (req) => {
    if (req.user) await AuthService.setRefreshToken(req.user.sub, null);
    return { ok: true };
  });

  app.get('/auth/me', { preHandler: requireAuth }, async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'Unauthorized' });
    const u = await UserModel.findById(req.user.sub)
      .select('-passwordHash -refreshTokenHash')
      .lean();
    if (!u) return reply.code(404).send({ error: 'not found' });
    return { user: u };
  });

  const UpdateMeSchema = z.object({ email: z.string().email() });
  app.patch(
    '/auth/me',
    { preHandler: [requireAuth, validateBody(UpdateMeSchema)] },
    async (req, reply) => {
      if (!req.user) return reply.code(401).send({ error: 'Unauthorized' });
      const { email } = req.body as z.infer<typeof UpdateMeSchema>;
      const updated = await AuthService.updateOwnEmail(req.user.sub, email);
      if (!updated) return reply.code(404).send({ error: 'not found' });
      await AuditService.log({
        actor: req.user,
        action: 'ACCOUNT_EMAIL_UPDATE',
        resource: 'user',
        resourceId: req.user.sub,
        diff: { email },
        ip: req.ip,
      });
      EmailService.sendAccountChanged({
        to: email,
        username: updated.username,
        change: 'email',
        ip: req.ip,
      }).catch(() => undefined);
      return { ok: true, email: updated.email };
    }
  );

  const ChangePwdSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
  });
  app.post(
    '/auth/me/password',
    { preHandler: [requireAuth, validateBody(ChangePwdSchema)] },
    async (req, reply) => {
      if (!req.user) return reply.code(401).send({ error: 'Unauthorized' });
      const { currentPassword, newPassword } = req.body as z.infer<typeof ChangePwdSchema>;
      const result = await AuthService.changeOwnPassword(
        req.user.sub,
        currentPassword,
        newPassword
      );
      if (!result.ok) {
        if (result.reason === 'bad_password') {
          return reply.code(400).send({ error: 'Current password is incorrect' });
        }
        return reply.code(404).send({ error: 'not found' });
      }
      await AuditService.log({
        actor: req.user,
        action: 'ACCOUNT_PASSWORD_CHANGE',
        resource: 'user',
        resourceId: req.user.sub,
        ip: req.ip,
      });
      if (result.user?.email) {
        EmailService.sendAccountChanged({
          to: result.user.email,
          username: result.user.username,
          change: 'password',
          ip: req.ip,
        }).catch(() => undefined);
      }
      return { ok: true };
    }
  );
}
