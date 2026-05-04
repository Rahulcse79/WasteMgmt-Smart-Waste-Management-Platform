import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { UserModel } from '../models/User.js';
import { AuthService } from '../services/auth.service.js';
import { AuditService } from '../services/audit.service.js';
import { EmailService } from '../services/email.service.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { passwordSchema } from '../utils/passwordPolicy.js';
import { wsHub } from '../services/ws.service.js';
import { config } from '../config.js';
import { parsePage, buildEnvelope } from '../utils/pagination.js';

const CreateUserSchema = z.object({
  username: z.string().trim().min(2).max(64).regex(/^[a-z0-9_.-]+$/i, 'invalid_username'),
  password: passwordSchema,
  role: z.enum(['admin', 'user']),
  email: z.string().email().optional(),
  assignedDustbins: z.array(z.string()).max(2000).optional(),
});

const UpdateUserSchema = z.object({
  email: z.string().email().optional(),
  role: z.enum(['admin', 'user']).optional(),
  assignedDustbins: z.array(z.string()).max(2000).optional(),
  isActive: z.boolean().optional(),
});

const ResetPwdSchema = z.object({
  newPassword: passwordSchema.optional(),
});

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/users',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (req) => {
      const q = req.query as { q?: string; role?: string };
      const filter: Record<string, unknown> = { isActive: true };
      if (q.role === 'admin' || q.role === 'user') filter.role = q.role;
      if (q.q && q.q.trim()) {
        const safe = q.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rx = new RegExp(safe, 'i');
        filter.$or = [{ username: rx }, { email: rx }];
      }
      const p = parsePage(req);
      if (p.legacy) {
        return UserModel.find(filter)
          .select('-passwordHash -refreshTokenHash')
          .sort({ username: 1 })
          .lean();
      }
      const [items, total] = await Promise.all([
        UserModel.find(filter)
          .select('-passwordHash -refreshTokenHash')
          .sort({ username: 1 })
          .skip(p.skip)
          .limit(p.pageSize)
          .lean(),
        p.skipTotal ? Promise.resolve(-1) : UserModel.countDocuments(filter),
      ]);
      return buildEnvelope(items, total, p);
    }
  );

  app.post(
    '/users',
    { preHandler: [requireAuth, requireRole('admin'), validateBody(CreateUserSchema)] },
    async (req, reply) => {
      const body = req.body as z.infer<typeof CreateUserSchema>;
      const exists = await UserModel.findOne({ username: body.username.toLowerCase() }).lean();
      if (exists) return reply.code(409).send({ error: 'username exists' });
      const u = await AuthService.createUser(body);
      await AuditService.log({
        actor: req.user,
        action: 'USER_CREATE',
        resource: 'user',
        resourceId: u.id,
        diff: { username: body.username, role: body.role, email: body.email },
        ip: req.ip,
      });

      // Welcome email with credentials (if user provided an address).
      if (body.email) {
        EmailService.sendWelcome({
          to: body.email,
          username: body.username,
          password: body.password,
          role: body.role,
          loginUrl: config.PUBLIC_ORIGIN ? `${config.PUBLIC_ORIGIN}/login` : undefined,
        }).catch(() => undefined);
      }

      return { id: u.id, username: u.username, role: u.role, email: u.email };
    }
  );

  app.patch<{ Params: { id: string } }>(
    '/users/:id',
    { preHandler: [requireAuth, requireRole('admin'), validateBody(UpdateUserSchema)] },
    async (req, reply) => {
      const body = req.body as z.infer<typeof UpdateUserSchema>;
      // Self-protection: don't let an admin demote or deactivate themselves.
      if (req.user!.sub === req.params.id) {
        if (body.role !== undefined && body.role !== 'admin') {
          return reply.code(400).send({ error: 'cannot demote your own account' });
        }
        if (body.isActive === false) {
          return reply.code(400).send({ error: 'cannot deactivate your own account' });
        }
      }
      const update: Record<string, unknown> = {};
      if (body.email !== undefined) update.email = body.email.toLowerCase();
      if (body.role !== undefined) update.role = body.role;
      if (body.assignedDustbins !== undefined) update.assignedDustbins = body.assignedDustbins;
      if (body.isActive !== undefined) update.isActive = body.isActive;
      const u = await UserModel.findByIdAndUpdate(req.params.id, { $set: update }, { new: true })
        .select('-passwordHash -refreshTokenHash')
        .lean();
      if (!u) return reply.code(404).send({ error: 'not found' });
      // Live-refresh dustbin scoping for any active WS sessions for this user.
      if (body.assignedDustbins !== undefined) {
        wsHub.refreshAssignment(req.params.id, body.assignedDustbins);
      }
      // If the account was deactivated, also tear down its sockets immediately.
      if (body.isActive === false) {
        wsHub.refreshAssignment(req.params.id, []);
        wsHub.closeUserSessions(req.params.id);
      }
      await AuditService.log({
        actor: req.user,
        action: 'USER_UPDATE',
        resource: 'user',
        resourceId: req.params.id,
        diff: update,
        ip: req.ip,
      });
      return u;
    }
  );

  app.post<{ Params: { id: string } }>(
    '/users/:id/reset-password',
    { preHandler: [requireAuth, requireRole('admin'), validateBody(ResetPwdSchema)] },
    async (req) => {
      const body = req.body as z.infer<typeof ResetPwdSchema>;
      const newPwd = body.newPassword ?? AuthService.randomPassword();
      await AuthService.resetPassword(req.params.id, newPwd);
      const u = await UserModel.findById(req.params.id).select('username email').lean();
      await AuditService.log({
        actor: req.user,
        action: 'USER_RESET_PWD',
        resource: 'user',
        resourceId: req.params.id,
        ip: req.ip,
      });
      if (u?.email) {
        EmailService.sendAccountChanged({
          to: u.email,
          username: u.username,
          change: 'password',
          ip: req.ip,
        }).catch(() => undefined);
      }
      return { newPassword: newPwd };
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/users/:id',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (req, reply) => {
      // Self-protection: an admin must not be able to lock themselves out.
      if (req.user!.sub === req.params.id) {
        return reply.code(400).send({ error: 'cannot delete your own account' });
      }
      await UserModel.updateOne({ _id: req.params.id }, { $set: { isActive: false, refreshTokenHash: null } });
      // Drop dustbin scope on any live WS sessions and close them so the user
      // is forced to re-auth (which will fail because isActive=false).
      wsHub.refreshAssignment(req.params.id, []);
      wsHub.closeUserSessions(req.params.id);
      await AuditService.log({
        actor: req.user,
        action: 'USER_DELETE',
        resource: 'user',
        resourceId: req.params.id,
        ip: req.ip,
      });
      return { ok: true };
    }
  );
}
