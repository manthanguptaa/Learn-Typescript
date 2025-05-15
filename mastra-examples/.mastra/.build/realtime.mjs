import { a as als, i as inngest, s as srcExports } from './_virtual__virtual-inngest.mjs';
import { l as lib } from './_virtual__virtual-zod.mjs';

var dist = {};

var channel = {};

var topic$1 = {};

Object.defineProperty(topic$1, "__esModule", { value: true });
topic$1.TopicDefinitionImpl = topic$1.topic = void 0;
/**
 * TODO
 */
const topic = (
/**
 * TODO
 */
id) => {
    return new TopicDefinitionImpl(id);
};
topic$1.topic = topic;
class TopicDefinitionImpl {
    name;
    #schema;
    constructor(name, schema) {
        this.name = name;
        this.#schema = schema;
    }
    type() {
        return this;
    }
    schema(schema) {
        return new TopicDefinitionImpl(this.name, schema);
    }
    getSchema() {
        return this.#schema;
    }
}
topic$1.TopicDefinitionImpl = TopicDefinitionImpl;

(function (exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.typeOnlyChannel = exports.channel = void 0;
	const topic_1 = topic$1;
	/**
	 * TODO
	 */
	const channel = (
	/**
	 * TODO
	 */
	id) => {
	    // eslint-disable-next-line prefer-const, @typescript-eslint/no-explicit-any
	    let channelDefinition;
	    const topics = {};
	    const builder = (...args) => {
	        const finalId = typeof id === "string" ? id : id(...args);
	        const topicsFns = Object.entries(topics).reduce((acc, [name, topic]) => {
	            acc[name] = createTopicFn(finalId, topic);
	            return acc;
	        }, {});
	        const channel = {
	            name: finalId,
	            topics,
	            ...topicsFns,
	        };
	        return channel;
	    };
	    const extras = {
	        topics,
	        addTopic: (topic) => {
	            topics[topic.name] = topic;
	            return channelDefinition;
	        },
	    };
	    channelDefinition = Object.assign(builder, extras);
	    return channelDefinition;
	};
	exports.channel = channel;
	/**
	 * TODO
	 */
	const typeOnlyChannel = (
	/**
	 * TODO
	 */
	id) => {
	    const blankChannel = {
	        ...(0, exports.channel)(id),
	        topics: new Proxy({}, {
	            get: (target, prop) => {
	                if (prop in target) {
	                    return target[prop];
	                }
	                if (typeof prop === "string") {
	                    return (0, topic_1.topic)(prop);
	                }
	            },
	        }),
	    };
	    const ch = new Proxy(blankChannel, {
	        get: (target, prop) => {
	            if (prop in target) {
	                return target[prop];
	            }
	            if (typeof prop === "string") {
	                return createTopicFn(id, (0, topic_1.topic)(prop));
	            }
	        },
	    });
	    return ch;
	};
	exports.typeOnlyChannel = typeOnlyChannel;
	const createTopicFn = (channelId, topic) => {
	    return async (data) => {
	        const schema = topic.getSchema();
	        if (schema) {
	            try {
	                await schema["~standard"].validate(data);
	            }
	            catch (err) {
	                console.error(`Failed schema validation for channel "${channelId}" topic "${topic.name}":`, err);
	                throw new Error("Failed schema validation");
	            }
	        }
	        return {
	            channel: channelId,
	            topic: topic.name,
	            data,
	        };
	    };
	};
	
} (channel));

var middleware = {};

var experimental = {};

(function (exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.getAsyncCtx = void 0;
	var als_js_1 = als;
	Object.defineProperty(exports, "getAsyncCtx", { enumerable: true, get: function () { return als_js_1.getAsyncCtx; } });
	
} (experimental));

Object.defineProperty(middleware, "__esModule", { value: true });
middleware.realtimeMiddleware = void 0;
const inngest_1 = inngest;
const experimental_1 = experimental;
const realtimeMiddleware = () => {
    return new inngest_1.InngestMiddleware({
        name: "publish",
        init({ client }) {
            return {
                onFunctionRun({ ctx: { runId } }) {
                    return {
                        transformInput({ ctx: { step } }) {
                            const publish = async (input) => {
                                const { topic, channel, data } = await input;
                                const store = await (0, experimental_1.getAsyncCtx)();
                                if (!store) {
                                    throw new Error("No ALS found, but is required for running `publish()`");
                                }
                                const publishOpts = {
                                    topics: [topic],
                                    channel,
                                    runId,
                                };
                                const action = async () => {
                                    const result = await client["inngestApi"].publish(publishOpts, data);
                                    if (!result.ok) {
                                        throw new Error(`Failed to publish event: ${result.error?.error}`);
                                    }
                                };
                                return (store.executingStep
                                    ? action()
                                    : step.run(`publish:${publishOpts.channel}`, action)).then(() => {
                                    // Always return the data passed in to the `publish` call.
                                    return data;
                                });
                            };
                            return {
                                ctx: {
                                    /**
                                     * TODO
                                     */
                                    publish,
                                },
                            };
                        },
                    };
                },
            };
        },
    });
};
middleware.realtimeMiddleware = realtimeMiddleware;

var subscribe$1 = {};

var helpers = {};

var env$1 = {};

Object.defineProperty(env$1, "__esModule", { value: true });
env$1.getEnvVar = void 0;
/**
 * The environment variables that we wish to access in the environment.
 *
 * Due to the way that some environment variables are exposed across different
 * runtimes and bundling tools, we need to be careful about how we access them.
 *
 * The most basic annoyance is that environment variables are exposed in
 * different locations (e.g. `process.env`, `Deno.env`, `Netlify.env`,
 * `import.meta.env`).
 *
 * Bundling can be more disruptive though, where some will literally
 * find/replace `process.env.MY_VAR` with the value of `MY_VAR` at build time,
 * which requires us to ensure that the full env var is used in code instead of
 * dynamically building it.
 */
const env = (() => {
    try {
        // Nodeish, including Vite
        if (process.env) {
            return {
                INNGEST_DEV: process.env.INNGEST_DEV ??
                    process.env.NEXT_PUBLIC_INNGEST_DEV ??
                    process.env.REACT_APP_INNGEST_DEV ??
                    process.env.NUXT_PUBLIC_INNGEST_DEV ??
                    process.env.VUE_APP_INNGEST_DEV ??
                    process.env.VITE_INNGEST_DEV,
                NODE_ENV: process.env.NODE_ENV ??
                    process.env.NEXT_PUBLIC_NODE_ENV ??
                    process.env.REACT_APP_NODE_ENV ??
                    process.env.NUXT_PUBLIC_NODE_ENV ??
                    process.env.VUE_APP_NODE_ENV ??
                    process.env.VITE_NODE_ENV ??
                    process.env.VITE_MODE,
                INNGEST_BASE_URL: process.env.INNGEST_BASE_URL ??
                    process.env.NEXT_PUBLIC_INNGEST_BASE_URL ??
                    process.env.REACT_APP_INNGEST_BASE_URL ??
                    process.env.NUXT_PUBLIC_INNGEST_BASE_URL ??
                    process.env.VUE_APP_INNGEST_BASE_URL ??
                    process.env.VITE_INNGEST_BASE_URL,
                INNGEST_API_BASE_URL: process.env.INNGEST_API_BASE_URL ??
                    process.env.NEXT_PUBLIC_INNGEST_API_BASE_URL ??
                    process.env.REACT_APP_INNGEST_API_BASE_URL ??
                    process.env.NUXT_PUBLIC_INNGEST_API_BASE_URL ??
                    process.env.VUE_APP_INNGEST_API_BASE_URL ??
                    process.env.VITE_INNGEST_API_BASE_URL,
                INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
                INNGEST_SIGNING_KEY_FALLBACK: process.env.INNGEST_SIGNING_KEY_FALLBACK,
            };
        }
    }
    catch {
        // noop
    }
    // Deno
    try {
        const denoEnv = Deno.env.toObject();
        if (denoEnv) {
            return {
                INNGEST_DEV: denoEnv.INNGEST_DEV,
                NODE_ENV: denoEnv.NODE_ENV,
                INNGEST_BASE_URL: denoEnv.INNGEST_BASE_URL,
                INNGEST_API_BASE_URL: denoEnv.INNGEST_API_BASE_URL,
                INNGEST_SIGNING_KEY: denoEnv.INNGEST_SIGNING_KEY,
                INNGEST_SIGNING_KEY_FALLBACK: denoEnv.INNGEST_SIGNING_KEY_FALLBACK,
            };
        }
    }
    catch {
        // noop
    }
    // Netlify
    try {
        const netlifyEnv = Netlify.env.toObject();
        if (netlifyEnv) {
            return {
                INNGEST_DEV: netlifyEnv.INNGEST_DEV,
                NODE_ENV: netlifyEnv.NODE_ENV,
                INNGEST_BASE_URL: netlifyEnv.INNGEST_BASE_URL,
                INNGEST_API_BASE_URL: netlifyEnv.INNGEST_API_BASE_URL,
                INNGEST_SIGNING_KEY: netlifyEnv.INNGEST_SIGNING_KEY,
                INNGEST_SIGNING_KEY_FALLBACK: netlifyEnv.INNGEST_SIGNING_KEY_FALLBACK,
            };
        }
    }
    catch {
        // noop
    }
})();
/**
 * Given a `key`, get the environment variable under that key.
 */
const getEnvVar = (key) => {
    return env?.[key];
};
env$1.getEnvVar = getEnvVar;

var TokenSubscription$1 = {};

var api = {};

var util = {};

(function (exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.parseAsBoolean = exports.createDeferredPromise = void 0;
	exports.fetchWithAuthFallback = fetchWithAuthFallback;
	/**
	 * Creates and returns Promise that can be resolved or rejected with the
	 * returned `resolve` and `reject` functions.
	 *
	 * Resolving or rejecting the function will return a new set of Promise control
	 * functions. These can be ignored if the original Promise is all that's needed.
	 */
	const createDeferredPromise = () => {
	    let resolve;
	    let reject;
	    const promise = new Promise((_resolve, _reject) => {
	        resolve = (value) => {
	            _resolve(value);
	            return (0, exports.createDeferredPromise)();
	        };
	        reject = (reason) => {
	            _reject(reason);
	            return (0, exports.createDeferredPromise)();
	        };
	    });
	    return { promise, resolve: resolve, reject: reject };
	};
	exports.createDeferredPromise = createDeferredPromise;
	/**
	 * Send an HTTP request with the given signing key. If the response is a 401 or
	 * 403, then try again with the fallback signing key
	 */
	async function fetchWithAuthFallback({ authToken, authTokenFallback, fetch, options, url, }) {
	    let res = await fetch(url, {
	        ...options,
	        headers: {
	            ...options?.headers,
	            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
	        },
	    });
	    if ([401, 403].includes(res.status) && authTokenFallback) {
	        res = await fetch(url, {
	            ...options,
	            headers: {
	                ...options?.headers,
	                Authorization: `Bearer ${authTokenFallback}`,
	            },
	        });
	    }
	    return res;
	}
	/**
	 * Given an unknown value, try to parse it as a `boolean`. Useful for parsing
	 * environment variables that could be a selection of different values such as
	 * `"true"`, `"1"`.
	 *
	 * If the value could not be confidently parsed as a `boolean` or was seen to be
	 * `undefined`, this function returns `undefined`.
	 */
	const parseAsBoolean = (value) => {
	    if (typeof value === "boolean") {
	        return value;
	    }
	    if (typeof value === "number") {
	        return Boolean(value);
	    }
	    if (typeof value === "string") {
	        const trimmed = value.trim().toLowerCase();
	        if (trimmed === "undefined") {
	            return undefined;
	        }
	        if (["true", "1"].includes(trimmed)) {
	            return true;
	        }
	        return false;
	    }
	    return undefined;
	};
	exports.parseAsBoolean = parseAsBoolean;
	
} (util));

Object.defineProperty(api, "__esModule", { value: true });
api.api = void 0;
const zod_1$1 = lib;
const env_1$2 = env$1;
const util_1$1 = util;
const tokenSchema = zod_1$1.z.object({ jwt: zod_1$1.z.string() });
api.api = {
    async getSubscriptionToken({ channel, topics, signingKey, signingKeyFallback, apiBaseUrl, }) {
        let url;
        const path = "/v1/realtime/token";
        const inputBaseUrl = apiBaseUrl ||
            (0, env_1$2.getEnvVar)("INNGEST_BASE_URL") ||
            (0, env_1$2.getEnvVar)("INNGEST_API_BASE_URL");
        const devEnvVar = (0, env_1$2.getEnvVar)("INNGEST_DEV");
        if (inputBaseUrl) {
            url = new URL(path, inputBaseUrl);
        }
        else if (devEnvVar) {
            try {
                const devUrl = new URL(devEnvVar);
                url = new URL(path, devUrl);
            }
            catch {
                if ((0, util_1$1.parseAsBoolean)(devEnvVar)) {
                    url = new URL(path, "http://localhost:8288/");
                }
                else {
                    url = new URL(path, "https://api.inngest.com/");
                }
            }
        }
        else {
            url = new URL(path, (0, env_1$2.getEnvVar)("NODE_ENV") === "production"
                ? "https://api.inngest.com/"
                : "http://localhost:8288/");
        }
        const body = topics.map((topic) => ({
            channel,
            name: topic,
            kind: "run",
        }));
        const res = await (0, util_1$1.fetchWithAuthFallback)({
            authToken: signingKey,
            authTokenFallback: signingKeyFallback,
            fetch,
            url,
            options: {
                method: "POST",
                body: JSON.stringify(body),
                headers: {
                    "Content-Type": "application/json",
                },
            },
        });
        if (!res.ok) {
            throw new Error(`Failed to get subscription token: ${res.status} ${res.statusText} - ${await res.text()}`);
        }
        const data = await res.json();
        return tokenSchema.parse(data).jwt;
    },
};

var types = {};

Object.defineProperty(types, "__esModule", { value: true });
types.Realtime = void 0;
const zod_1 = lib;
var Realtime;
(function (Realtime) {
    Realtime.messageSchema = zod_1.z
        .object({
        channel: zod_1.z.string().optional(),
        topic: zod_1.z.string().optional(),
        data: zod_1.z.any(),
        run_id: zod_1.z.string().optional(),
        fn_id: zod_1.z.string().optional(),
        created_at: zod_1.z
            .string()
            .optional()
            .transform((v) => (v ? new Date(v) : undefined)),
        env_id: zod_1.z.string().optional(),
        stream_id: zod_1.z.string().optional(),
        kind: zod_1.z.enum([
            "step",
            "run",
            "data",
            "ping",
            "pong",
            "closing",
            "event",
            "sub",
            "unsub",
            "datastream-start",
            "datastream-end",
            "chunk",
        ]),
    })
        .transform(({ data, ...rest }) => {
        return {
            ...rest,
            data: data ?? undefined,
        };
    });
})(Realtime || (types.Realtime = Realtime = {}));

var StreamFanout$1 = {};

Object.defineProperty(StreamFanout$1, "__esModule", { value: true });
StreamFanout$1.StreamFanout = void 0;
/**
 * TODO
 */
class StreamFanout {
    #writers = new Set();
    /**
     * TODO
     */
    createStream(
    /**
     * TODO
     */
    transform) {
        const { readable, writable } = new TransformStream({
            transform: (chunk, controller) => {
                controller.enqueue(transform ? transform(chunk) : chunk);
            },
        });
        const writer = writable.getWriter();
        this.#writers.add(writer);
        // Eagerly remove the writer is the stream is closed
        writer.closed
            .catch(() => { }) // Suppress unhandled promise rejection to avoid noisy logs
            .finally(() => {
            this.#writers.delete(writer);
        });
        return readable;
    }
    /**
     * TODO
     */
    write(
    /**
     * TODO
     */
    chunk) {
        for (const writer of this.#writers) {
            writer.ready
                .then(() => writer.write(chunk))
                // Dereference the writer if we fail, as this means it's closed
                .catch(() => this.#writers.delete(writer));
        }
    }
    /**
     * TODO
     */
    close() {
        for (const writer of this.#writers) {
            try {
                writer.close();
            }
            catch {
                // Ignore errors, as we are closing the stream and the writer may
                // already be closed, especially if the stream is closed before the
                // writer is closed or if the stream is cancelled.
            }
        }
        this.#writers.clear();
    }
    /**
     * TODO
     */
    size() {
        return this.#writers.size;
    }
}
StreamFanout$1.StreamFanout = StreamFanout;

var __importDefault = (TokenSubscription$1 && TokenSubscription$1.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(TokenSubscription$1, "__esModule", { value: true });
TokenSubscription$1.TokenSubscription = void 0;
const debug_1 = __importDefault(srcExports);
const api_1 = api;
const env_1$1 = env$1;
const topic_1 = topic$1;
const types_1 = types;
const util_1 = util;
const StreamFanout_1 = StreamFanout$1;
/**
 * TODO
 */
class TokenSubscription {
    token;
    #apiBaseUrl;
    #channelId;
    #debug = (0, debug_1.default)("inngest:realtime");
    #encoder = new TextEncoder();
    #fanout = new StreamFanout_1.StreamFanout();
    #running = false;
    #topics;
    #ws = null;
    #signingKey;
    #signingKeyFallback;
    /**
     * This is a map that tracks stream IDs to their corresponding streams and
     * controllers.
     */
    #chunkStreams = new Map();
    constructor(
    /**
     * TODO
     */
    token, apiBaseUrl, signingKey, signingKeyFallback) {
        this.token = token;
        this.#apiBaseUrl = apiBaseUrl;
        this.#signingKey = signingKey;
        this.#signingKeyFallback = signingKeyFallback;
        if (typeof token.channel === "string") {
            this.#channelId = token.channel;
            this.#topics = this.token.topics.reduce((acc, name) => {
                acc.set(name, (0, topic_1.topic)(name));
                return acc;
            }, new Map());
        }
        else {
            this.#channelId = token.channel.name;
            this.#topics = this.token.topics.reduce((acc, name) => {
                acc.set(name, token.channel.topics[name] ?? (0, topic_1.topic)(name));
                return acc;
            }, new Map());
        }
    }
    async getWsUrl(token) {
        let url;
        const path = "/v1/realtime/connect";
        const devEnvVar = (0, env_1$1.getEnvVar)("INNGEST_DEV");
        if (this.#apiBaseUrl) {
            url = new URL(path, this.#apiBaseUrl);
        }
        else if (devEnvVar) {
            try {
                const devUrl = new URL(devEnvVar);
                url = new URL(path, devUrl);
            }
            catch {
                if ((0, util_1.parseAsBoolean)(devEnvVar)) {
                    url = new URL(path, "http://localhost:8288/");
                }
                else {
                    url = new URL(path, "https://api.inngest.com/");
                }
            }
        }
        else {
            url = new URL(path, (0, env_1$1.getEnvVar)("NODE_ENV") === "production"
                ? "https://api.inngest.com/"
                : "http://localhost:8288/");
        }
        url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
        url.searchParams.set("token", token);
        return url;
    }
    /**
     * TODO
     */
    async connect() {
        this.#debug(`Establishing connection to channel "${this.#channelId}" with topics ${JSON.stringify([...this.#topics.keys()])}...`);
        if (typeof WebSocket === "undefined") {
            throw new Error("WebSockets not supported in current environment");
        }
        let key = this.token.key;
        if (!key) {
            this.#debug("No subscription token key passed; attempting to retrieve one automatically...");
            key = (await this.lazilyGetSubscriptionToken({
                ...this.token,
                signingKey: this.#signingKey,
                signingKeyFallback: this.#signingKeyFallback,
            })).key;
            if (!key) {
                throw new Error("No subscription token key passed and failed to retrieve one automatically");
            }
        }
        const ret = (0, util_1.createDeferredPromise)();
        try {
            this.#ws = new WebSocket(await this.getWsUrl(key));
            this.#ws.onopen = () => {
                this.#debug("WebSocket connection established");
                ret.resolve();
            };
            this.#ws.onmessage = async (event) => {
                const parseRes = await types_1.Realtime.messageSchema.safeParseAsync(JSON.parse(event.data));
                if (!parseRes.success) {
                    this.#debug("Received invalid message:", parseRes.error);
                    return;
                }
                const msg = parseRes.data;
                if (!this.#running) {
                    this.#debug(`Received message on channel "${msg.channel}" for topic "${msg.topic}" but stream is closed`);
                }
                switch (msg.kind) {
                    case "data": {
                        if (!msg.channel) {
                            this.#debug(`Received message on channel "${msg.channel}" with no channel`);
                            return;
                        }
                        if (!msg.topic) {
                            this.#debug(`Received message on channel "${msg.channel}" with no topic`);
                            return;
                        }
                        const topic = this.#topics.get(msg.topic);
                        if (!topic) {
                            this.#debug(`Received message on channel "${msg.channel}" for unknown topic "${msg.topic}"`);
                            return;
                        }
                        const schema = topic.getSchema();
                        if (schema) {
                            const validateRes = await schema["~standard"].validate(msg.data);
                            if (validateRes.issues) {
                                console.error(`Received message on channel "${msg.channel}" for topic "${msg.topic}" that failed schema validation:`, validateRes.issues);
                                return;
                            }
                            msg.data = validateRes.value;
                        }
                        this.#debug(`Received message on channel "${msg.channel}" for topic "${msg.topic}":`, msg.data);
                        return this.#fanout.write({
                            channel: msg.channel,
                            topic: msg.topic,
                            data: msg.data,
                            fnId: msg.fn_id,
                            createdAt: msg.created_at || new Date(),
                            runId: msg.run_id,
                            kind: "data",
                            envId: msg.env_id,
                        });
                    }
                    case "datastream-start": {
                        if (!msg.channel) {
                            this.#debug(`Received message on channel "${msg.channel}" with no channel`);
                            return;
                        }
                        if (!msg.topic) {
                            this.#debug(`Received message on channel "${msg.channel}" with no topic`);
                            return;
                        }
                        const streamId = msg.data;
                        if (typeof streamId !== "string" || !streamId) {
                            this.#debug(`Received message on channel "${msg.channel}" with no stream ID`);
                            return;
                        }
                        // `data` is a stream ID that we'll start receiving chunks with
                        if (this.#chunkStreams.has(streamId)) {
                            this.#debug(`Received message on channel "${msg.channel}" to create stream ID "${streamId}" that already exists`);
                            return;
                        }
                        const stream = new ReadableStream({
                            start: (controller) => {
                                this.#chunkStreams.set(streamId, { stream, controller });
                            },
                            cancel: () => {
                                this.#chunkStreams.delete(streamId);
                            },
                        });
                        this.#debug(`Created stream ID "${streamId}" on channel "${msg.channel}"`);
                        return this.#fanout.write({
                            channel: msg.channel,
                            topic: msg.topic,
                            kind: "datastream-start",
                            data: streamId,
                            streamId,
                            fnId: msg.fn_id,
                            runId: msg.run_id,
                            stream,
                        });
                    }
                    case "datastream-end": {
                        if (!msg.channel) {
                            this.#debug(`Received message on channel "${msg.channel}" with no channel`);
                            return;
                        }
                        if (!msg.topic) {
                            this.#debug(`Received message on channel "${msg.channel}" with no topic`);
                            return;
                        }
                        const streamId = msg.data;
                        if (typeof streamId !== "string" || !streamId) {
                            this.#debug(`Received message on channel "${msg.channel}" with no stream ID`);
                            return;
                        }
                        // `data` is a stream ID that we'll stop receiving chunks with
                        const stream = this.#chunkStreams.get(streamId);
                        if (!stream) {
                            this.#debug(`Received message on channel "${msg.channel}" to close stream ID "${streamId}" that doesn't exist`);
                            return;
                        }
                        stream.controller.close();
                        this.#chunkStreams.delete(streamId);
                        this.#debug(`Closed stream ID "${streamId}" on channel "${msg.channel}"`);
                        return this.#fanout.write({
                            channel: msg.channel,
                            topic: msg.topic,
                            kind: "datastream-end",
                            data: streamId,
                            streamId,
                            fnId: msg.fn_id,
                            runId: msg.run_id,
                            stream: stream.stream,
                        });
                    }
                    case "chunk": {
                        if (!msg.channel) {
                            this.#debug(`Received message on channel "${msg.channel}" with no channel`);
                            return;
                        }
                        if (!msg.topic) {
                            this.#debug(`Received message on channel "${msg.channel}" with no topic`);
                            return;
                        }
                        // `stream_id` is the ID of the stream we're receiving chunks for
                        if (!msg.stream_id) {
                            this.#debug(`Received message on channel "${msg.channel}" with no stream ID`);
                            return;
                        }
                        const stream = this.#chunkStreams.get(msg.stream_id);
                        if (!stream) {
                            this.#debug(`Received message on channel "${msg.channel}" for unknown stream ID "${msg.stream_id}"`);
                            return;
                        }
                        this.#debug(`Received chunk on channel "${msg.channel}" for stream ID "${msg.stream_id}":`, msg.data);
                        stream.controller.enqueue(msg.data);
                        return this.#fanout.write({
                            channel: msg.channel,
                            topic: msg.topic,
                            kind: "chunk",
                            data: msg.data,
                            streamId: msg.stream_id,
                            fnId: msg.fn_id,
                            runId: msg.run_id,
                            stream: stream.stream,
                        });
                    }
                    default: {
                        this.#debug(`Received message on channel "${msg.channel}" with unhandled kind "${msg.kind}"`);
                        return;
                    }
                }
            };
            this.#ws.onerror = (event) => {
                console.error("WebSocket error observed:", event);
                ret.reject(event);
            };
            this.#ws.onclose = (event) => {
                this.#debug("WebSocket closed:", event.reason);
                this.close();
            };
            this.#running = true;
        }
        catch (err) {
            ret.reject(err);
        }
        return ret.promise;
    }
    /**
     * TODO
     */
    async lazilyGetSubscriptionToken(
    /**
     * TODO
     */
    args) {
        const channelId = typeof args.channel === "string" ? args.channel : args.channel.name;
        if (!channelId) {
            throw new Error("Channel ID is required to create a subscription token");
        }
        const key = await api_1.api.getSubscriptionToken({
            channel: channelId,
            topics: args.topics,
            signingKey: args.signingKey,
            signingKeyFallback: args.signingKeyFallback,
            apiBaseUrl: this.#apiBaseUrl,
        });
        const token = {
            channel: channelId,
            topics: args.topics,
            key,
        };
        return token;
    }
    /**
     * TODO
     */
    close(
    /**
     * TODO
     */
    reason = "Userland closed connection") {
        if (!this.#running) {
            return;
        }
        this.#debug("close() called; closing connection...");
        this.#running = false;
        this.#ws?.close(1000, reason);
        this.#debug(`Closing ${this.#fanout.size()} streams...`);
        this.#fanout.close();
    }
    /**
     * TODO
     */
    getJsonStream() {
        return this.#fanout.createStream();
    }
    /**
     * TODO
     */
    getEncodedStream() {
        return this.#fanout.createStream((chunk) => {
            return this.#encoder.encode(`${JSON.stringify(chunk)}\n`);
        });
    }
    /**
     * TODO
     */
    useCallback(callback, stream = this.getJsonStream()) {
        void (async () => {
            // Explicitly get and manage the reader so that we can manually release
            // the lock if anything goes wrong or we're done with it.
            const reader = stream.getReader();
            try {
                while (this.#running) {
                    const { done, value } = await reader.read();
                    if (done || !this.#running)
                        break;
                    callback(value);
                }
            }
            finally {
                reader.releaseLock();
            }
        })();
    }
}
TokenSubscription$1.TokenSubscription = TokenSubscription;

Object.defineProperty(helpers, "__esModule", { value: true });
helpers.getSubscriptionToken = helpers.subscribe = void 0;
const env_1 = env$1;
const TokenSubscription_1 = TokenSubscription$1;
/**
 * TODO
 */
const subscribe = async (
/**
 * TODO
 */
token, 
/**
 * TODO
 */
callback) => {
    const app = token.app;
    const api = app?.["inngestApi"];
    // Allow users to specify public env vars for the target URLs, but do not
    // allow this for signing keys, as they should never be on a client.
    const maybeApiBaseUrl = app?.apiBaseUrl ||
        (0, env_1.getEnvVar)("INNGEST_BASE_URL") ||
        (0, env_1.getEnvVar)("INNGEST_API_BASE_URL");
    const maybeSigningKey = api?.["signingKey"] || (0, env_1.getEnvVar)("INNGEST_SIGNING_KEY");
    const maybeSigningKeyFallback = api?.["signingKeyFallback"] || (0, env_1.getEnvVar)("INNGEST_SIGNING_KEY_FALLBACK");
    const subscription = new TokenSubscription_1.TokenSubscription(token, maybeApiBaseUrl, maybeSigningKey, maybeSigningKeyFallback);
    const retStream = subscription.getJsonStream();
    const callbackStream = subscription.getJsonStream();
    await subscription.connect();
    const extras = {
        getJsonStream: () => subscription.getJsonStream(),
        getEncodedStream: () => subscription.getEncodedStream(),
    };
    if (callback) {
        subscription.useCallback(callback, callbackStream);
    }
    else {
        callbackStream.cancel("Not needed");
    }
    return Object.assign(retStream, extras);
};
helpers.subscribe = subscribe;
/**
 * TODO
 */
const getSubscriptionToken = async (
/**
 * TODO
 */
app, 
/**
 * TODO
 */
args) => {
    const channelId = typeof args.channel === "string" ? args.channel : args.channel.name;
    if (!channelId) {
        throw new Error("Channel ID is required to create a subscription token");
    }
    const key = await app["inngestApi"].getSubscriptionToken(channelId, args.topics);
    const token = {
        channel: channelId,
        topics: args.topics,
        key,
    };
    return token;
};
helpers.getSubscriptionToken = getSubscriptionToken;

(function (exports) {
	var __createBinding = (subscribe$1 && subscribe$1.__createBinding) || (Object.create ? (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    var desc = Object.getOwnPropertyDescriptor(m, k);
	    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
	      desc = { enumerable: true, get: function() { return m[k]; } };
	    }
	    Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    o[k2] = m[k];
	}));
	var __exportStar = (subscribe$1 && subscribe$1.__exportStar) || function(m, exports) {
	    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	__exportStar(helpers, exports);
	
} (subscribe$1));

(function (exports) {
	var __createBinding = (dist && dist.__createBinding) || (Object.create ? (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    var desc = Object.getOwnPropertyDescriptor(m, k);
	    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
	      desc = { enumerable: true, get: function() { return m[k]; } };
	    }
	    Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    o[k2] = m[k];
	}));
	var __exportStar = (dist && dist.__exportStar) || function(m, exports) {
	    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	__exportStar(channel, exports);
	__exportStar(middleware, exports);
	__exportStar(subscribe$1, exports);
	__exportStar(topic$1, exports);
	__exportStar(types, exports);
	
} (dist));

export { dist as d };
