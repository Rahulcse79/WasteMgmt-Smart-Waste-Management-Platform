/*
	Demo MQTT simulator for WasteMgmt platform.

	Publishes OneM2M-compatible payloads for 10 dustbins located in India.
	Payload shape matches wastemgmt_api/src/services/mqtt.service.ts:
		{
			pc: {
				"m2m:cin": {
					cr: "<dustbinId>",
					ct: "YYYYMMDDTHHmmss",
					con: { depth, gas, humidity, temperature, latitude, longitude, city, country }
				}
			}
		}

	Optional: auto-create dustbins in API before publishing.
*/

const mqtt = require("mqtt");
const fs = require("fs");
const net = require("net");
const aedesFactory = require("aedes");

const CFG = {
	MQTT_BROKER_URL: process.env.MQTT_BROKER_URL || "",
	MQTT_PROTOCOL: process.env.MQTT_PROTOCOL || "mqtt",
	MQTT_HOST: process.env.MQTT_HOST || "127.0.0.1",
	MQTT_PORT: Number(process.env.MQTT_PORT || 1883),
	MQTT_TOPIC: process.env.MQTT_TOPIC || "/oneM2M/resp/#",
	MQTT_QOS: Number(process.env.MQTT_QOS || 0),
	MQTT_USERNAME: process.env.MQTT_USERNAME || "",
	MQTT_PASSWORD: process.env.MQTT_PASSWORD || "",
	MQTT_REJECT_UNAUTHORIZED: String(process.env.MQTT_REJECT_UNAUTHORIZED || "false") !== "false",
	MQTT_CA_CERT: process.env.MQTT_CA_CERT || "",
	MQTT_CLIENT_CERT: process.env.MQTT_CLIENT_CERT || "",
	MQTT_CLIENT_KEY: process.env.MQTT_CLIENT_KEY || "",

	API_BASE_URL: process.env.API_BASE_URL || "http://localhost:3023",
	ADMIN_USERNAME: process.env.ADMIN_USERNAME || "admin",
	ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "admin",
	PROVISION_DUSTBINS: String(process.env.PROVISION_DUSTBINS || "true") === "true",

	INTERVAL_MS: Math.max(1000, Number(process.env.INTERVAL_MS || 5000)),
	LOG_EVERY_N_CYCLES: Math.max(1, Number(process.env.LOG_EVERY_N_CYCLES || 3)),
	START_LOCAL_BROKER: String(process.env.START_LOCAL_BROKER || "true") === "true",
};

let localBrokerServer = null;

async function startLocalBrokerIfNeeded() {
	if (!CFG.START_LOCAL_BROKER) return;
	const isLocalPlainMqtt = (CFG.MQTT_PROTOCOL === "mqtt" || CFG.MQTT_BROKER_URL.startsWith("mqtt://"))
		&& ["127.0.0.1", "localhost"].includes(CFG.MQTT_HOST);
	if (!isLocalPlainMqtt) return;

	const broker = aedesFactory();
	const server = net.createServer(broker.handle);

	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(CFG.MQTT_PORT, "127.0.0.1", () => resolve());
	});

	localBrokerServer = server;
	console.log(`Embedded MQTT broker started at mqtt://127.0.0.1:${CFG.MQTT_PORT}`);
}

async function stopLocalBroker() {
	if (!localBrokerServer) return;
	await new Promise((resolve) => localBrokerServer.close(() => resolve()));
	localBrokerServer = null;
}

const INDIA_LOCATIONS = [
	{ city: "Delhi", state: "Delhi", lat: 28.6139, lon: 77.209 },
	{ city: "Mumbai", state: "Maharashtra", lat: 19.076, lon: 72.8777 },
	{ city: "Bengaluru", state: "Karnataka", lat: 12.9716, lon: 77.5946 },
	{ city: "Hyderabad", state: "Telangana", lat: 17.385, lon: 78.4867 },
	{ city: "Chennai", state: "Tamil Nadu", lat: 13.0827, lon: 80.2707 },
	{ city: "Kolkata", state: "West Bengal", lat: 22.5726, lon: 88.3639 },
	{ city: "Pune", state: "Maharashtra", lat: 18.5204, lon: 73.8567 },
	{ city: "Ahmedabad", state: "Gujarat", lat: 23.0225, lon: 72.5714 },
	{ city: "Jaipur", state: "Rajasthan", lat: 26.9124, lon: 75.7873 },
	{ city: "Lucknow", state: "Uttar Pradesh", lat: 26.8467, lon: 80.9462 },
];

function jitter(base, delta = 0.03) {
	return +(base + (Math.random() * 2 - 1) * delta).toFixed(6);
}

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function randomBetween(min, max) {
	return min + Math.random() * (max - min);
}

function formatCt(date = new Date()) {
	const pad = (n) => String(n).padStart(2, "0");
	const yyyy = date.getUTCFullYear();
	const mm = pad(date.getUTCMonth() + 1);
	const dd = pad(date.getUTCDate());
	const HH = pad(date.getUTCHours());
	const MM = pad(date.getUTCMinutes());
	const SS = pad(date.getUTCSeconds());
	return `${yyyy}${mm}${dd}T${HH}${MM}${SS}`;
}

function makeDustbins() {
	return INDIA_LOCATIONS.map((loc, idx) => ({
		dustbinId: `IN-DB-${String(idx + 1).padStart(3, "0")}`,
		dustbinName: `${loc.city} Smart Bin ${idx + 1}`,
		city: loc.city,
		state: loc.state,
		latitude: jitter(loc.lat),
		longitude: jitter(loc.lon),
		// Stateful metrics for smoother random walk
		metrics: {
			depth: randomBetween(15, 85),
			gas: randomBetween(120, 480),
			humidity: randomBetween(35, 78),
			temperature: randomBetween(24, 37),
		},
	}));
}

function nextMetrics(prev) {
	return {
		depth: clamp(prev.depth + randomBetween(-4.5, 6.5), 0, 100),
		gas: clamp(prev.gas + randomBetween(-35, 42), 40, 900),
		humidity: clamp(prev.humidity + randomBetween(-5, 5), 20, 98),
		temperature: clamp(prev.temperature + randomBetween(-1.1, 1.3), 18, 49),
	};
}

async function loginAdmin() {
	const res = await fetch(`${CFG.API_BASE_URL}/auth/login`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ username: CFG.ADMIN_USERNAME, password: CFG.ADMIN_PASSWORD }),
	});
	if (!res.ok) {
		const txt = await res.text();
		throw new Error(`Admin login failed (${res.status}): ${txt}`);
	}
	const json = await res.json();
	if (!json?.accessToken) throw new Error("Login response missing accessToken");
	return json.accessToken;
}

async function provisionDustbins(dustbins) {
	const token = await loginAdmin();
	for (const d of dustbins) {
		const body = {
			dustbinId: d.dustbinId,
			dustbinName: d.dustbinName,
			latitude: d.latitude,
			longitude: d.longitude,
			zone: `${d.city}, ${d.state}`,
		};
		const res = await fetch(`${CFG.API_BASE_URL}/dustbins`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${token}`,
			},
			body: JSON.stringify(body),
		});
		if (!res.ok) {
			const txt = await res.text();
			console.warn(`provision warn ${d.dustbinId}: ${res.status} ${txt}`);
		}
	}
}

function makeTopic(dustbinId) {
	const base = CFG.MQTT_TOPIC.endsWith("/#") ? CFG.MQTT_TOPIC.slice(0, -2) : CFG.MQTT_TOPIC;
	return `${base}/${dustbinId}`;
}

function makePayload(d, metrics) {
	return {
		pc: {
			"m2m:cin": {
				cr: d.dustbinId,
				ct: formatCt(),
				con: {
					depth: +metrics.depth.toFixed(2),
					gas: +metrics.gas.toFixed(2),
					humidity: +metrics.humidity.toFixed(2),
					temperature: +metrics.temperature.toFixed(2),
					latitude: d.latitude,
					longitude: d.longitude,
					city: d.city,
					state: d.state,
					country: "India",
				},
			},
		},
	};
}

async function main() {
	const dustbins = makeDustbins();
	const brokerUrl = CFG.MQTT_BROKER_URL || `${CFG.MQTT_PROTOCOL}://${CFG.MQTT_HOST}:${CFG.MQTT_PORT}`;
	await startLocalBrokerIfNeeded();

	console.log("Demo MQTT simulator starting...");
	console.log(`Broker: ${brokerUrl}`);
	console.log(`Topic: ${CFG.MQTT_TOPIC}`);
	console.log(`Bins: ${dustbins.length}`);
	console.log(`Interval: ${CFG.INTERVAL_MS} ms`);

	if (CFG.PROVISION_DUSTBINS) {
		try {
			await provisionDustbins(dustbins);
			console.log("Dustbin provisioning finished (create/update via API).");
		} catch (err) {
			console.warn(`Provision skipped due to error: ${err.message}`);
		}
	}

	const tlsOpts = {};
	if (brokerUrl.startsWith("mqtts://") || brokerUrl.startsWith("wss://")) {
		if (CFG.MQTT_CA_CERT && fs.existsSync(CFG.MQTT_CA_CERT)) {
			tlsOpts.ca = fs.readFileSync(CFG.MQTT_CA_CERT);
		}
		if (CFG.MQTT_CLIENT_CERT && fs.existsSync(CFG.MQTT_CLIENT_CERT)) {
			tlsOpts.cert = fs.readFileSync(CFG.MQTT_CLIENT_CERT);
		}
		if (CFG.MQTT_CLIENT_KEY && fs.existsSync(CFG.MQTT_CLIENT_KEY)) {
			tlsOpts.key = fs.readFileSync(CFG.MQTT_CLIENT_KEY);
		}
	}

	const client = mqtt.connect(brokerUrl, {
		username: CFG.MQTT_USERNAME || undefined,
		password: CFG.MQTT_PASSWORD || undefined,
		rejectUnauthorized: CFG.MQTT_REJECT_UNAUTHORIZED,
		reconnectPeriod: 4000,
		keepalive: 30,
		clientId: `demo-publisher-${Math.random().toString(16).slice(2, 10)}`,
		...tlsOpts,
	});

	client.on("connect", () => {
		console.log("MQTT connected.");
		console.log("Publishing sensor frames... Press Ctrl+C to stop.");

		let cycle = 0;
		const timer = setInterval(() => {
			cycle += 1;

			for (const d of dustbins) {
				d.metrics = nextMetrics(d.metrics);
				const payload = makePayload(d, d.metrics);
				const topic = makeTopic(d.dustbinId);
				client.publish(topic, JSON.stringify(payload), { qos: CFG.MQTT_QOS, retain: false });
			}

			if (cycle % CFG.LOG_EVERY_N_CYCLES === 0) {
				const sample = dustbins[Math.floor(Math.random() * dustbins.length)];
				console.log(
					`[cycle ${cycle}] ${sample.dustbinId} ${sample.city} depth=${sample.metrics.depth.toFixed(1)}% gas=${sample.metrics.gas.toFixed(0)} hum=${sample.metrics.humidity.toFixed(1)} temp=${sample.metrics.temperature.toFixed(1)}`
				);
			}
		}, CFG.INTERVAL_MS);

		const shutdown = () => {
			clearInterval(timer);
			client.end(true, () => {
				console.log("Simulator stopped.");
				process.exit(0);
			});
		};

		process.on("SIGINT", shutdown);
		process.on("SIGTERM", shutdown);
	});

	client.on("error", (err) => {
		console.error("MQTT error:", err.message);
	});

	client.on("reconnect", () => {
		console.log("MQTT reconnecting...");
	});

	const hardShutdown = async () => {
		try {
			client.end(true);
		} catch {}
		await stopLocalBroker();
	};

	process.on("exit", () => {
		void hardShutdown();
	});
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
