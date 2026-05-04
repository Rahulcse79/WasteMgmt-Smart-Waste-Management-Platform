import { readFileSync } from 'node:fs';
import mqtt, { type MqttClient } from 'mqtt';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { DustbinService, type Metric } from './dustbin.service.js';
import { RulesService } from './rules.service.js';
import { wsHub } from './ws.service.js';

let client: MqttClient | null = null;

interface OneM2MPayload {
  pc?: {
    'm2m:cin'?: {
      cr?: string;
      ct?: string;
      con?: Record<string, unknown>;
    };
  };
}

/**
 * Parse the OneM2M ct timestamp "YYYYMMDDTHHmmss" to a JS Date.
 */
function parseCt(ct?: string): Date {
  if (!ct || !/^\d{8}T\d{6}$/.test(ct)) return new Date();
  const yyyy = ct.slice(0, 4);
  const mm = ct.slice(4, 6);
  const dd = ct.slice(6, 8);
  const hh = ct.slice(9, 11);
  const mi = ct.slice(11, 13);
  const ss = ct.slice(13, 15);
  return new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}Z`);
}

/**
 * Map raw payload `con` keys to our metric model. The IoT payload uses keys like
 * `wss` (wet sensor), `bl` (battery), etc. — extend this table as needed.
 */
function extractMetrics(con: Record<string, unknown>): Partial<Record<Metric, number>> {
  const out: Partial<Record<Metric, number>> = {};
  // Direct mappings
  if (typeof con.depth === 'number') out.depth = con.depth;
  if (typeof con.gas === 'number') out.gas = con.gas;
  if (typeof con.humidity === 'number') out.humidity = con.humidity;
  if (typeof con.temperature === 'number') out.temperature = con.temperature;
  // Aliases observed in the field
  if (out.depth === undefined && typeof con.litre === 'number') out.depth = con.litre;
  if (out.gas === undefined && typeof con.ph === 'number') out.gas = con.ph;
  if (out.humidity === undefined && typeof con.tds === 'number') out.humidity = con.tds;
  if (out.temperature === undefined && typeof con.flowrate === 'number') {
    out.temperature = con.flowrate / 1000; // crude conversion fallback
  }
  return out;
}

export const MqttService = {
  start(): void {
    if (!config.MQTT_ENABLED) {
      logger.info('MQTT disabled (MQTT_ENABLED=false)');
      return;
    }
    let ca: Buffer | undefined;
    let cert: Buffer | undefined;
    let key: Buffer | undefined;
    try {
      if (config.MQTT_CA_CERT) ca = readFileSync(config.MQTT_CA_CERT);
      if (config.MQTT_CLIENT_CERT) cert = readFileSync(config.MQTT_CLIENT_CERT);
      if (config.MQTT_CLIENT_KEY) key = readFileSync(config.MQTT_CLIENT_KEY);
    } catch (err) {
      logger.error({ err }, 'Failed to read MQTT TLS material');
      return;
    }

    const url = `${config.MQTT_PROTOCOL}://${config.MQTT_HOST}:${config.MQTT_PORT}`;
    // Reconnect with full-jitter exponential backoff. The mqtt library calls
    // this option every reconnect cycle to compute the next delay, so we can
    // grow the wait window without restarting the client.
    let reconnectAttempts = 0;
    const baseDelayMs = 1000;
    const maxDelayMs = 60_000;
    const computeReconnectDelay = (): number => {
      const expCap = Math.min(maxDelayMs, baseDelayMs * 2 ** reconnectAttempts);
      reconnectAttempts = Math.min(reconnectAttempts + 1, 16);
      // Full jitter: random between 0 and expCap. Avoids thundering-herd.
      return Math.floor(Math.random() * expCap);
    };
    client = mqtt.connect(url, {
      clientId: config.MQTT_CLIENT_ID,
      ca,
      cert,
      key,
      rejectUnauthorized: config.MQTT_REJECT_UNAUTHORIZED,
      // Initial value; replaced on each cycle by computeReconnectDelay below.
      reconnectPeriod: baseDelayMs,
      keepalive: 30,
    });
    // mqtt v5 lets us mutate options.reconnectPeriod between attempts.
    const mutate = client as unknown as { options: { reconnectPeriod: number } };
    client.on('connect', () => { reconnectAttempts = 0; mutate.options.reconnectPeriod = baseDelayMs; });
    client.on('close', () => { mutate.options.reconnectPeriod = computeReconnectDelay(); });

    client.on('connect', () => {
      logger.info({ url }, '📡 MQTT connected');
      client!.subscribe(config.MQTT_TOPIC, { qos: 0 }, (err) => {
        if (err) logger.error({ err }, 'MQTT subscribe failed');
        else logger.info({ topic: config.MQTT_TOPIC }, '📡 MQTT subscribed');
      });
    });

    client.on('reconnect', () => logger.warn({ nextDelayMs: mutate.options.reconnectPeriod }, '📡 MQTT reconnecting…'));
    client.on('error', (err) => logger.error({ err }, '📡 MQTT error'));
    client.on('close', () => logger.warn('📡 MQTT connection closed'));

    client.on('message', async (topic, buf) => {
      try {
        const text = buf.toString('utf8');
        const json = JSON.parse(text) as OneM2MPayload;
        const cin = json?.pc?.['m2m:cin'];
        if (!cin?.cr || !cin?.con) return;

        const dustbinId = cin.cr;
        const ts = parseCt(cin.ct);
        const metrics = extractMetrics(cin.con);
        if (Object.keys(metrics).length === 0) return;

        await DustbinService.ingestBulkReadings({ dustbinId, timestamp: ts, readings: metrics });

        // Push live update to dashboards
        wsHub.broadcast(`dustbin:${dustbinId}`, 'reading', {
          dustbinId,
          timestamp: ts,
          metrics,
        });
        wsHub.broadcast('dustbin:*', 'reading', { dustbinId, timestamp: ts, metrics });

        // Evaluate alert rules in parallel
        await Promise.all(
          (Object.entries(metrics) as Array<[Metric, number]>).map(([metric, value]) =>
            RulesService.evaluate({ dustbinId, metric, value })
          )
        );
      } catch (err) {
        logger.error({ err, topic }, 'MQTT message handling failed');
      }
    });
  },

  async stop(): Promise<void> {
    if (client) {
      await new Promise<void>((res) => client!.end(false, {}, () => res()));
      client = null;
    }
  },
};
