import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Singleton-ish runtime configuration editable by admins from the UI.
 * Uses key-value pairs so we can extend without schema migrations.
 */
const AppConfigSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Schema.Types.Mixed },
    description: { type: String, default: '' },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

export type AppConfigDoc = HydratedDocument<InferSchemaType<typeof AppConfigSchema>>;
export const AppConfigModel = model('AppConfig', AppConfigSchema);

export const CONFIG_KEYS = {
  MQTT_BROKER_URL: 'mqtt.brokerUrl',
  MQTT_TOPIC: 'mqtt.topic',
  CAMERAS: 'cameras',
  CAMERA_STREAM_1: 'camera.stream1',
  CAMERA_STREAM_2: 'camera.stream2',
  ALERT_THRESHOLDS: 'alerts.thresholds',
  ALERT_EMAIL_TO: 'alerts.emailTo',
} as const;
