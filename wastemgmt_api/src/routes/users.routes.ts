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
    async () =>
      UserModel.find({ isActive: true })
        .select('-passwordHash -refreshTokenHash')
        .sort({ username: 1 })
        .lean()
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
    async (req) => {
      await UserModel.updateOne({ _id: req.params.id }, { $set: { isActive: false } });
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
