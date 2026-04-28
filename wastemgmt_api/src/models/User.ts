import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, index: true, trim: true, lowercase: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    /** AES-256-GCM(iv:tag:ct) of the raw password — recoverable by the server only. */
    passwordEnc: { type: String, default: '' },
    role: { type: String, enum: ['admin', 'user'], required: true, index: true },
    assignedDustbins: [{ type: String, index: true }], // dustbinId list (for user role scoping)
    isActive: { type: Boolean, default: true, index: true },
    lastLoginAt: { type: Date },
    refreshTokenHash: { type: String, default: null }, // rotating refresh token (hash only)
  },
  { timestamps: true }
);

UserSchema.index({ role: 1, isActive: 1 });

export type UserDoc = HydratedDocument<InferSchemaType<typeof UserSchema>>;
export const UserModel = model('User', UserSchema);
