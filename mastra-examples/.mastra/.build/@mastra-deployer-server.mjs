import crypto, { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import { join } from 'path/posix';
import { Readable } from 'stream';
import { getFilePathWithoutDefaultDocument, getFilePath } from './hono-utils-filepath.mjs';
import { getMimeType } from './hono-utils-mime.mjs';
import { createReadStream, lstatSync } from 'fs';
import { html } from './hono-html.mjs';
import { Hono } from './hono.mjs';
import { bodyLimit } from './hono-body-limit.mjs';
import { cors } from './hono-cors.mjs';
import { logger } from './hono-logger.mjs';
import { timeout } from './hono-timeout.mjs';
import { HTTPException as HTTPException$1 } from './hono-http-exception.mjs';
import { stream } from './hono-streaming.mjs';
import { Readable as Readable$1, Writable } from 'node:stream';
import util from 'node:util';
import { Buffer as Buffer$1 } from 'node:buffer';
import { l as lib } from './_virtual__virtual-zod.mjs';
import { T as Telemetry } from './core.mjs';
import { RuntimeContext } from './@mastra-core-runtime-context.mjs';
import { A2AError } from './@mastra-core-a2a.mjs';
import { Agent } from './@mastra-core-agent.mjs';
import { i as isVercelTool } from './utils.mjs';
import { ReadableStream as ReadableStream$1 } from 'node:stream/web';

var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/server/handlers/a2a.ts
var a2a_exports = {};
__export(a2a_exports, {
  getAgentCardByIdHandler: () => getAgentCardByIdHandler$1,
  getAgentExecutionHandler: () => getAgentExecutionHandler$1,
  handleTaskCancel: () => handleTaskCancel,
  handleTaskGet: () => handleTaskGet,
  handleTaskSend: () => handleTaskSend,
  handleTaskSendSubscribe: () => handleTaskSendSubscribe
});
function normalizeError(error, reqId, taskId, logger) {
  let a2aError;
  if (error instanceof A2AError) {
    a2aError = error;
  } else if (error instanceof Error) {
    a2aError = A2AError.internalError(error.message, { stack: error.stack });
  } else {
    a2aError = A2AError.internalError("An unknown error occurred.", error);
  }
  if (taskId && !a2aError.taskId) {
    a2aError.taskId = taskId;
  }
  logger?.error(`Error processing request (Task: ${a2aError.taskId ?? "N/A"}, ReqID: ${reqId ?? "N/A"}):`, a2aError);
  return createErrorResponse(reqId, a2aError.toJSONRPCError());
}
function createErrorResponse(id, error) {
  return {
    jsonrpc: "2.0",
    id,
    // Can be null if request ID was invalid/missing
    error
  };
}
function createSuccessResponse(id, result) {
  if (!id) {
    throw A2AError.internalError("Cannot create success response for null ID.");
  }
  return {
    jsonrpc: "2.0",
    id,
    result
  };
}
function convertToCoreMessage(message) {
  return {
    role: message.role === "user" ? "user" : "assistant",
    content: message.parts.map((msg) => convertToCoreMessagePart(msg))
  };
}
function convertToCoreMessagePart(part) {
  switch (part.type) {
    case "text":
      return {
        type: "text",
        text: part.text
      };
    case "file":
      return {
        type: "file",
        data: new URL(part.file.uri),
        mimeType: part.file.mimeType
      };
    case "data":
      throw new Error("Data parts are not supported in core messages");
  }
}

// src/server/a2a/store.ts
var InMemoryTaskStore = class {
  store = /* @__PURE__ */ new Map();
  activeCancellations = /* @__PURE__ */ new Set();
  async load({ agentId, taskId }) {
    const entry = this.store.get(`${agentId}-${taskId}`);
    if (!entry) {
      return null;
    }
    return { task: { ...entry.task }, history: [...entry.history] };
  }
  async save({ agentId, data }) {
    const key = `${agentId}-${data.task.id}`;
    if (!data.task.id) {
      throw new Error("Task ID is required");
    }
    this.store.set(key, {
      task: { ...data.task },
      history: [...data.history]
    });
  }
};

// src/server/a2a/tasks.ts
function isTaskStatusUpdate(update) {
  return "state" in update && !("parts" in update);
}
function isArtifactUpdate(update) {
  return "parts" in update;
}
function applyUpdateToTaskAndHistory(current, update) {
  let newTask = structuredClone(current.task);
  let newHistory = structuredClone(current.history);
  if (isTaskStatusUpdate(update)) {
    newTask.status = {
      ...newTask.status,
      // Keep existing properties if not overwritten
      ...update,
      // Apply updates
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (update.message?.role === "agent") {
      newHistory.push(update.message);
    }
  } else if (isArtifactUpdate(update)) {
    if (!newTask.artifacts) {
      newTask.artifacts = [];
    } else {
      newTask.artifacts = [...newTask.artifacts];
    }
    const existingIndex = update.index ?? -1;
    let replaced = false;
    if (existingIndex >= 0 && existingIndex < newTask.artifacts.length) {
      const existingArtifact = newTask.artifacts[existingIndex];
      if (update.append) {
        const appendedArtifact = JSON.parse(JSON.stringify(existingArtifact));
        appendedArtifact.parts.push(...update.parts);
        if (update.metadata) {
          appendedArtifact.metadata = {
            ...appendedArtifact.metadata || {},
            ...update.metadata
          };
        }
        if (update.lastChunk !== void 0) appendedArtifact.lastChunk = update.lastChunk;
        if (update.description) appendedArtifact.description = update.description;
        newTask.artifacts[existingIndex] = appendedArtifact;
        replaced = true;
      } else {
        newTask.artifacts[existingIndex] = { ...update };
        replaced = true;
      }
    } else if (update.name) {
      const namedIndex = newTask.artifacts.findIndex((a) => a.name === update.name);
      if (namedIndex >= 0) {
        newTask.artifacts[namedIndex] = { ...update };
        replaced = true;
      }
    }
    if (!replaced) {
      newTask.artifacts.push({ ...update });
      if (newTask.artifacts.some((a) => a.index !== void 0)) {
        newTask.artifacts.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      }
    }
  }
  return { task: newTask, history: newHistory };
}
async function loadOrCreateTaskAndHistory({
  agentId,
  taskId,
  taskStore,
  message,
  sessionId,
  metadata,
  logger
}) {
  const data = await taskStore.load({ agentId, taskId });
  if (!data) {
    const initialTask = {
      id: taskId,
      sessionId,
      status: {
        state: "submitted",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        message: null
      },
      artifacts: [],
      metadata
    };
    const initialData = {
      task: initialTask,
      history: [message]
    };
    logger?.info(`[Task ${taskId}] Created new task and history.`);
    await taskStore.save({ agentId, data: initialData });
    return initialData;
  }
  logger?.info(`[Task ${taskId}] Loaded existing task and history.`);
  let updatedData = {
    task: data.task,
    history: [...data.history, message]
  };
  const { status } = data.task;
  const finalStates = ["completed", "failed", "canceled"];
  if (finalStates.includes(status.state)) {
    logger?.warn(`[Task ${taskId}] Received message for task in final state ${status.state}. Restarting.`);
    updatedData = applyUpdateToTaskAndHistory(updatedData, {
      state: "submitted",
      message: null
    });
  } else if (status.state === "input-required") {
    logger?.info(`[Task ${taskId}] Changing state from 'input-required' to 'working'.`);
    updatedData = applyUpdateToTaskAndHistory(updatedData, { state: "working" });
  } else if (status.state === "working") {
    logger?.warn(`[Task ${taskId}] Received message while already 'working'. Proceeding.`);
  }
  await taskStore.save({ agentId, data: updatedData });
  return {
    task: { ...updatedData.task },
    history: [...updatedData.history]
  };
}
function createTaskContext({
  task,
  userMessage,
  history,
  activeCancellations
}) {
  return {
    task: structuredClone(task),
    userMessage,
    history: structuredClone(history),
    isCancelled: () => activeCancellations.has(task.id)
  };
}

// src/server/handlers/a2a.ts
var taskSendParamsSchema = lib.z.object({
  id: lib.z.string().min(1, "Invalid or missing task ID (params.id)."),
  message: lib.z.object({
    parts: lib.z.array(
      lib.z.object({
        type: lib.z.enum(["text"]),
        text: lib.z.string()
      })
    )
  })
});
async function getAgentCardByIdHandler$1({
  mastra,
  agentId,
  executionUrl = `/a2a/${agentId}`,
  provider = {
    organization: "Mastra",
    url: "https://mastra.ai"
  },
  version = "1.0",
  runtimeContext
}) {
  const agent = mastra.getAgent(agentId);
  if (!agent) {
    throw new Error(`Agent with ID ${agentId} not found`);
  }
  const [instructions, tools] = await Promise.all([
    agent.getInstructions({ runtimeContext }),
    agent.getTools({ runtimeContext })
  ]);
  const agentCard = {
    name: agent.id || agentId,
    description: instructions,
    url: executionUrl,
    provider,
    version,
    capabilities: {
      streaming: true,
      // All agents support streaming
      pushNotifications: false,
      stateTransitionHistory: false
    },
    defaultInputModes: ["text"],
    defaultOutputModes: ["text"],
    // Convert agent tools to skills format for A2A protocol
    skills: Object.entries(tools).map(([toolId, tool]) => ({
      id: toolId,
      name: toolId,
      description: tool.description || `Tool: ${toolId}`,
      // Optional fields
      tags: ["tool"]
    }))
  };
  return agentCard;
}
function validateTaskSendParams(params) {
  try {
    taskSendParamsSchema.parse(params);
  } catch (error) {
    if (error instanceof lib.z.ZodError) {
      throw A2AError.invalidParams(error.errors[0].message);
    }
    throw error;
  }
}
async function handleTaskSend({
  requestId,
  params,
  taskStore,
  agent,
  logger,
  runtimeContext
}) {
  validateTaskSendParams(params);
  const agentId = agent.id;
  const { id: taskId, message, sessionId, metadata } = params;
  let currentData = await loadOrCreateTaskAndHistory({
    taskId,
    taskStore,
    agentId,
    message,
    sessionId,
    metadata
  });
  createTaskContext({
    task: currentData.task,
    userMessage: message,
    history: currentData.history,
    activeCancellations: taskStore.activeCancellations
  });
  try {
    const { text } = await agent.generate([convertToCoreMessage(message)], {
      runId: taskId,
      runtimeContext
    });
    currentData = applyUpdateToTaskAndHistory(currentData, {
      state: "completed",
      message: {
        role: "agent",
        parts: [
          {
            type: "text",
            text
          }
        ]
      }
    });
    await taskStore.save({ agentId, data: currentData });
  } catch (handlerError) {
    const failureStatusUpdate = {
      state: "failed",
      message: {
        role: "agent",
        parts: [
          {
            type: "text",
            text: `Handler failed: ${handlerError instanceof Error ? handlerError.message : String(handlerError)}`
          }
        ]
      }
    };
    currentData = applyUpdateToTaskAndHistory(currentData, failureStatusUpdate);
    try {
      await taskStore.save({ agentId, data: currentData });
    } catch (saveError) {
      logger?.error(`Failed to save task ${taskId} after handler error:`, saveError?.message);
    }
    return normalizeError(handlerError, requestId, taskId, logger);
  }
  return createSuccessResponse(requestId, currentData.task);
}
async function handleTaskGet({
  requestId,
  taskStore,
  agentId,
  taskId
}) {
  const task = await taskStore.load({ agentId, taskId });
  if (!task) {
    throw A2AError.taskNotFound(taskId);
  }
  return createSuccessResponse(requestId, task);
}
async function* handleTaskSendSubscribe({
  requestId,
  params,
  taskStore,
  agent,
  logger,
  runtimeContext
}) {
  yield createSuccessResponse(requestId, {
    state: "working",
    message: {
      role: "agent",
      parts: [{ type: "text", text: "Generating response..." }]
    }
  });
  let result;
  try {
    result = await handleTaskSend({
      requestId,
      params,
      taskStore,
      agent,
      runtimeContext,
      logger
    });
  } catch (err) {
    if (!(err instanceof A2AError)) {
      throw err;
    }
    result = createErrorResponse(requestId, err.toJSONRPCError());
  }
  yield result;
}
async function handleTaskCancel({
  requestId,
  taskStore,
  agentId,
  taskId,
  logger
}) {
  let data = await taskStore.load({
    agentId,
    taskId
  });
  if (!data) {
    throw A2AError.taskNotFound(taskId);
  }
  const finalStates = ["completed", "failed", "canceled"];
  if (finalStates.includes(data.task.status.state)) {
    logger?.info(`Task ${taskId} already in final state ${data.task.status.state}, cannot cancel.`);
    return createSuccessResponse(requestId, data.task);
  }
  taskStore.activeCancellations.add(taskId);
  const cancelUpdate = {
    state: "canceled",
    message: {
      role: "agent",
      parts: [{ type: "text", text: "Task cancelled by request." }]
    }
  };
  data = applyUpdateToTaskAndHistory(data, cancelUpdate);
  await taskStore.save({ agentId, data });
  taskStore.activeCancellations.delete(taskId);
  return createSuccessResponse(requestId, data.task);
}
async function getAgentExecutionHandler$1({
  requestId,
  mastra,
  agentId,
  runtimeContext,
  method,
  params,
  taskStore = new InMemoryTaskStore(),
  logger
}) {
  const agent = mastra.getAgent(agentId);
  let taskId;
  try {
    taskId = params.id;
    switch (method) {
      case "tasks/send": {
        const result2 = await handleTaskSend({
          requestId,
          params,
          taskStore,
          agent,
          runtimeContext
        });
        return result2;
      }
      case "tasks/sendSubscribe":
        const result = await handleTaskSendSubscribe({
          requestId,
          taskStore,
          params,
          agent,
          runtimeContext
        });
        return result;
      case "tasks/get": {
        const result2 = await handleTaskGet({
          requestId,
          taskStore,
          agentId,
          taskId
        });
        return result2;
      }
      case "tasks/cancel": {
        const result2 = await handleTaskCancel({
          requestId,
          taskStore,
          agentId,
          taskId
        });
        return result2;
      }
      default:
        throw A2AError.methodNotFound(method);
    }
  } catch (error) {
    if (error instanceof A2AError && taskId && !error.taskId) {
      error.taskId = taskId;
    }
    return normalizeError(error, requestId, taskId, logger);
  }
}

// ../../node_modules/.pnpm/superjson@2.2.2/node_modules/superjson/dist/double-indexed-kv.js
var DoubleIndexedKV = class {
  constructor() {
    this.keyToValue = /* @__PURE__ */ new Map();
    this.valueToKey = /* @__PURE__ */ new Map();
  }
  set(key, value) {
    this.keyToValue.set(key, value);
    this.valueToKey.set(value, key);
  }
  getByKey(key) {
    return this.keyToValue.get(key);
  }
  getByValue(value) {
    return this.valueToKey.get(value);
  }
  clear() {
    this.keyToValue.clear();
    this.valueToKey.clear();
  }
};

// ../../node_modules/.pnpm/superjson@2.2.2/node_modules/superjson/dist/registry.js
var Registry = class {
  constructor(generateIdentifier) {
    this.generateIdentifier = generateIdentifier;
    this.kv = new DoubleIndexedKV();
  }
  register(value, identifier) {
    if (this.kv.getByValue(value)) {
      return;
    }
    if (!identifier) {
      identifier = this.generateIdentifier(value);
    }
    this.kv.set(identifier, value);
  }
  clear() {
    this.kv.clear();
  }
  getIdentifier(value) {
    return this.kv.getByValue(value);
  }
  getValue(identifier) {
    return this.kv.getByKey(identifier);
  }
};

// ../../node_modules/.pnpm/superjson@2.2.2/node_modules/superjson/dist/class-registry.js
var ClassRegistry = class extends Registry {
  constructor() {
    super((c) => c.name);
    this.classToAllowedProps = /* @__PURE__ */ new Map();
  }
  register(value, options) {
    if (typeof options === "object") {
      if (options.allowProps) {
        this.classToAllowedProps.set(value, options.allowProps);
      }
      super.register(value, options.identifier);
    } else {
      super.register(value, options);
    }
  }
  getAllowedProps(value) {
    return this.classToAllowedProps.get(value);
  }
};

// ../../node_modules/.pnpm/superjson@2.2.2/node_modules/superjson/dist/util.js
function valuesOfObj(record) {
  if ("values" in Object) {
    return Object.values(record);
  }
  const values = [];
  for (const key in record) {
    if (record.hasOwnProperty(key)) {
      values.push(record[key]);
    }
  }
  return values;
}
function find(record, predicate) {
  const values = valuesOfObj(record);
  if ("find" in values) {
    return values.find(predicate);
  }
  const valuesNotNever = values;
  for (let i = 0; i < valuesNotNever.length; i++) {
    const value = valuesNotNever[i];
    if (predicate(value)) {
      return value;
    }
  }
  return void 0;
}
function forEach(record, run) {
  Object.entries(record).forEach(([key, value]) => run(value, key));
}
function includes(arr, value) {
  return arr.indexOf(value) !== -1;
}
function findArr(record, predicate) {
  for (let i = 0; i < record.length; i++) {
    const value = record[i];
    if (predicate(value)) {
      return value;
    }
  }
  return void 0;
}

// ../../node_modules/.pnpm/superjson@2.2.2/node_modules/superjson/dist/custom-transformer-registry.js
var CustomTransformerRegistry = class {
  constructor() {
    this.transfomers = {};
  }
  register(transformer) {
    this.transfomers[transformer.name] = transformer;
  }
  findApplicable(v) {
    return find(this.transfomers, (transformer) => transformer.isApplicable(v));
  }
  findByName(name) {
    return this.transfomers[name];
  }
};

// ../../node_modules/.pnpm/superjson@2.2.2/node_modules/superjson/dist/is.js
var getType = (payload) => Object.prototype.toString.call(payload).slice(8, -1);
var isUndefined = (payload) => typeof payload === "undefined";
var isNull = (payload) => payload === null;
var isPlainObject = (payload) => {
  if (typeof payload !== "object" || payload === null)
    return false;
  if (payload === Object.prototype)
    return false;
  if (Object.getPrototypeOf(payload) === null)
    return true;
  return Object.getPrototypeOf(payload) === Object.prototype;
};
var isEmptyObject = (payload) => isPlainObject(payload) && Object.keys(payload).length === 0;
var isArray = (payload) => Array.isArray(payload);
var isString = (payload) => typeof payload === "string";
var isNumber = (payload) => typeof payload === "number" && !isNaN(payload);
var isBoolean = (payload) => typeof payload === "boolean";
var isRegExp = (payload) => payload instanceof RegExp;
var isMap = (payload) => payload instanceof Map;
var isSet = (payload) => payload instanceof Set;
var isSymbol = (payload) => getType(payload) === "Symbol";
var isDate = (payload) => payload instanceof Date && !isNaN(payload.valueOf());
var isError = (payload) => payload instanceof Error;
var isNaNValue = (payload) => typeof payload === "number" && isNaN(payload);
var isPrimitive = (payload) => isBoolean(payload) || isNull(payload) || isUndefined(payload) || isNumber(payload) || isString(payload) || isSymbol(payload);
var isBigint = (payload) => typeof payload === "bigint";
var isInfinite = (payload) => payload === Infinity || payload === -Infinity;
var isTypedArray = (payload) => ArrayBuffer.isView(payload) && !(payload instanceof DataView);
var isURL = (payload) => payload instanceof URL;

// ../../node_modules/.pnpm/superjson@2.2.2/node_modules/superjson/dist/pathstringifier.js
var escapeKey = (key) => key.replace(/\./g, "\\.");
var stringifyPath = (path) => path.map(String).map(escapeKey).join(".");
var parsePath = (string) => {
  const result = [];
  let segment = "";
  for (let i = 0; i < string.length; i++) {
    let char = string.charAt(i);
    const isEscapedDot = char === "\\" && string.charAt(i + 1) === ".";
    if (isEscapedDot) {
      segment += ".";
      i++;
      continue;
    }
    const isEndOfSegment = char === ".";
    if (isEndOfSegment) {
      result.push(segment);
      segment = "";
      continue;
    }
    segment += char;
  }
  const lastSegment = segment;
  result.push(lastSegment);
  return result;
};

// ../../node_modules/.pnpm/superjson@2.2.2/node_modules/superjson/dist/transformer.js
function simpleTransformation(isApplicable, annotation, transform, untransform) {
  return {
    isApplicable,
    annotation,
    transform,
    untransform
  };
}
var simpleRules = [
  simpleTransformation(isUndefined, "undefined", () => null, () => void 0),
  simpleTransformation(isBigint, "bigint", (v) => v.toString(), (v) => {
    if (typeof BigInt !== "undefined") {
      return BigInt(v);
    }
    console.error("Please add a BigInt polyfill.");
    return v;
  }),
  simpleTransformation(isDate, "Date", (v) => v.toISOString(), (v) => new Date(v)),
  simpleTransformation(isError, "Error", (v, superJson) => {
    const baseError = {
      name: v.name,
      message: v.message
    };
    superJson.allowedErrorProps.forEach((prop) => {
      baseError[prop] = v[prop];
    });
    return baseError;
  }, (v, superJson) => {
    const e = new Error(v.message);
    e.name = v.name;
    e.stack = v.stack;
    superJson.allowedErrorProps.forEach((prop) => {
      e[prop] = v[prop];
    });
    return e;
  }),
  simpleTransformation(isRegExp, "regexp", (v) => "" + v, (regex) => {
    const body = regex.slice(1, regex.lastIndexOf("/"));
    const flags = regex.slice(regex.lastIndexOf("/") + 1);
    return new RegExp(body, flags);
  }),
  simpleTransformation(
    isSet,
    "set",
    // (sets only exist in es6+)
    // eslint-disable-next-line es5/no-es6-methods
    (v) => [...v.values()],
    (v) => new Set(v)
  ),
  simpleTransformation(isMap, "map", (v) => [...v.entries()], (v) => new Map(v)),
  simpleTransformation((v) => isNaNValue(v) || isInfinite(v), "number", (v) => {
    if (isNaNValue(v)) {
      return "NaN";
    }
    if (v > 0) {
      return "Infinity";
    } else {
      return "-Infinity";
    }
  }, Number),
  simpleTransformation((v) => v === 0 && 1 / v === -Infinity, "number", () => {
    return "-0";
  }, Number),
  simpleTransformation(isURL, "URL", (v) => v.toString(), (v) => new URL(v))
];
function compositeTransformation(isApplicable, annotation, transform, untransform) {
  return {
    isApplicable,
    annotation,
    transform,
    untransform
  };
}
var symbolRule = compositeTransformation((s, superJson) => {
  if (isSymbol(s)) {
    const isRegistered = !!superJson.symbolRegistry.getIdentifier(s);
    return isRegistered;
  }
  return false;
}, (s, superJson) => {
  const identifier = superJson.symbolRegistry.getIdentifier(s);
  return ["symbol", identifier];
}, (v) => v.description, (_, a, superJson) => {
  const value = superJson.symbolRegistry.getValue(a[1]);
  if (!value) {
    throw new Error("Trying to deserialize unknown symbol");
  }
  return value;
});
var constructorToName = [
  Int8Array,
  Uint8Array,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  Uint8ClampedArray
].reduce((obj, ctor) => {
  obj[ctor.name] = ctor;
  return obj;
}, {});
var typedArrayRule = compositeTransformation(isTypedArray, (v) => ["typed-array", v.constructor.name], (v) => [...v], (v, a) => {
  const ctor = constructorToName[a[1]];
  if (!ctor) {
    throw new Error("Trying to deserialize unknown typed array");
  }
  return new ctor(v);
});
function isInstanceOfRegisteredClass(potentialClass, superJson) {
  if (potentialClass?.constructor) {
    const isRegistered = !!superJson.classRegistry.getIdentifier(potentialClass.constructor);
    return isRegistered;
  }
  return false;
}
var classRule = compositeTransformation(isInstanceOfRegisteredClass, (clazz, superJson) => {
  const identifier = superJson.classRegistry.getIdentifier(clazz.constructor);
  return ["class", identifier];
}, (clazz, superJson) => {
  const allowedProps = superJson.classRegistry.getAllowedProps(clazz.constructor);
  if (!allowedProps) {
    return { ...clazz };
  }
  const result = {};
  allowedProps.forEach((prop) => {
    result[prop] = clazz[prop];
  });
  return result;
}, (v, a, superJson) => {
  const clazz = superJson.classRegistry.getValue(a[1]);
  if (!clazz) {
    throw new Error(`Trying to deserialize unknown class '${a[1]}' - check https://github.com/blitz-js/superjson/issues/116#issuecomment-773996564`);
  }
  return Object.assign(Object.create(clazz.prototype), v);
});
var customRule = compositeTransformation((value, superJson) => {
  return !!superJson.customTransformerRegistry.findApplicable(value);
}, (value, superJson) => {
  const transformer = superJson.customTransformerRegistry.findApplicable(value);
  return ["custom", transformer.name];
}, (value, superJson) => {
  const transformer = superJson.customTransformerRegistry.findApplicable(value);
  return transformer.serialize(value);
}, (v, a, superJson) => {
  const transformer = superJson.customTransformerRegistry.findByName(a[1]);
  if (!transformer) {
    throw new Error("Trying to deserialize unknown custom value");
  }
  return transformer.deserialize(v);
});
var compositeRules = [classRule, symbolRule, customRule, typedArrayRule];
var transformValue = (value, superJson) => {
  const applicableCompositeRule = findArr(compositeRules, (rule) => rule.isApplicable(value, superJson));
  if (applicableCompositeRule) {
    return {
      value: applicableCompositeRule.transform(value, superJson),
      type: applicableCompositeRule.annotation(value, superJson)
    };
  }
  const applicableSimpleRule = findArr(simpleRules, (rule) => rule.isApplicable(value, superJson));
  if (applicableSimpleRule) {
    return {
      value: applicableSimpleRule.transform(value, superJson),
      type: applicableSimpleRule.annotation
    };
  }
  return void 0;
};
var simpleRulesByAnnotation = {};
simpleRules.forEach((rule) => {
  simpleRulesByAnnotation[rule.annotation] = rule;
});
var untransformValue = (json, type, superJson) => {
  if (isArray(type)) {
    switch (type[0]) {
      case "symbol":
        return symbolRule.untransform(json, type, superJson);
      case "class":
        return classRule.untransform(json, type, superJson);
      case "custom":
        return customRule.untransform(json, type, superJson);
      case "typed-array":
        return typedArrayRule.untransform(json, type, superJson);
      default:
        throw new Error("Unknown transformation: " + type);
    }
  } else {
    const transformation = simpleRulesByAnnotation[type];
    if (!transformation) {
      throw new Error("Unknown transformation: " + type);
    }
    return transformation.untransform(json, superJson);
  }
};

// ../../node_modules/.pnpm/superjson@2.2.2/node_modules/superjson/dist/accessDeep.js
var getNthKey = (value, n) => {
  if (n > value.size)
    throw new Error("index out of bounds");
  const keys = value.keys();
  while (n > 0) {
    keys.next();
    n--;
  }
  return keys.next().value;
};
function validatePath(path) {
  if (includes(path, "__proto__")) {
    throw new Error("__proto__ is not allowed as a property");
  }
  if (includes(path, "prototype")) {
    throw new Error("prototype is not allowed as a property");
  }
  if (includes(path, "constructor")) {
    throw new Error("constructor is not allowed as a property");
  }
}
var getDeep = (object, path) => {
  validatePath(path);
  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    if (isSet(object)) {
      object = getNthKey(object, +key);
    } else if (isMap(object)) {
      const row = +key;
      const type = +path[++i] === 0 ? "key" : "value";
      const keyOfRow = getNthKey(object, row);
      switch (type) {
        case "key":
          object = keyOfRow;
          break;
        case "value":
          object = object.get(keyOfRow);
          break;
      }
    } else {
      object = object[key];
    }
  }
  return object;
};
var setDeep = (object, path, mapper) => {
  validatePath(path);
  if (path.length === 0) {
    return mapper(object);
  }
  let parent = object;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (isArray(parent)) {
      const index = +key;
      parent = parent[index];
    } else if (isPlainObject(parent)) {
      parent = parent[key];
    } else if (isSet(parent)) {
      const row = +key;
      parent = getNthKey(parent, row);
    } else if (isMap(parent)) {
      const isEnd = i === path.length - 2;
      if (isEnd) {
        break;
      }
      const row = +key;
      const type = +path[++i] === 0 ? "key" : "value";
      const keyOfRow = getNthKey(parent, row);
      switch (type) {
        case "key":
          parent = keyOfRow;
          break;
        case "value":
          parent = parent.get(keyOfRow);
          break;
      }
    }
  }
  const lastKey = path[path.length - 1];
  if (isArray(parent)) {
    parent[+lastKey] = mapper(parent[+lastKey]);
  } else if (isPlainObject(parent)) {
    parent[lastKey] = mapper(parent[lastKey]);
  }
  if (isSet(parent)) {
    const oldValue = getNthKey(parent, +lastKey);
    const newValue = mapper(oldValue);
    if (oldValue !== newValue) {
      parent.delete(oldValue);
      parent.add(newValue);
    }
  }
  if (isMap(parent)) {
    const row = +path[path.length - 2];
    const keyToRow = getNthKey(parent, row);
    const type = +lastKey === 0 ? "key" : "value";
    switch (type) {
      case "key": {
        const newKey = mapper(keyToRow);
        parent.set(newKey, parent.get(keyToRow));
        if (newKey !== keyToRow) {
          parent.delete(keyToRow);
        }
        break;
      }
      case "value": {
        parent.set(keyToRow, mapper(parent.get(keyToRow)));
        break;
      }
    }
  }
  return object;
};

// ../../node_modules/.pnpm/superjson@2.2.2/node_modules/superjson/dist/plainer.js
function traverse(tree, walker2, origin = []) {
  if (!tree) {
    return;
  }
  if (!isArray(tree)) {
    forEach(tree, (subtree, key) => traverse(subtree, walker2, [...origin, ...parsePath(key)]));
    return;
  }
  const [nodeValue, children] = tree;
  if (children) {
    forEach(children, (child, key) => {
      traverse(child, walker2, [...origin, ...parsePath(key)]);
    });
  }
  walker2(nodeValue, origin);
}
function applyValueAnnotations(plain, annotations, superJson) {
  traverse(annotations, (type, path) => {
    plain = setDeep(plain, path, (v) => untransformValue(v, type, superJson));
  });
  return plain;
}
function applyReferentialEqualityAnnotations(plain, annotations) {
  function apply(identicalPaths, path) {
    const object = getDeep(plain, parsePath(path));
    identicalPaths.map(parsePath).forEach((identicalObjectPath) => {
      plain = setDeep(plain, identicalObjectPath, () => object);
    });
  }
  if (isArray(annotations)) {
    const [root, other] = annotations;
    root.forEach((identicalPath) => {
      plain = setDeep(plain, parsePath(identicalPath), () => plain);
    });
    if (other) {
      forEach(other, apply);
    }
  } else {
    forEach(annotations, apply);
  }
  return plain;
}
var isDeep = (object, superJson) => isPlainObject(object) || isArray(object) || isMap(object) || isSet(object) || isInstanceOfRegisteredClass(object, superJson);
function addIdentity(object, path, identities) {
  const existingSet = identities.get(object);
  if (existingSet) {
    existingSet.push(path);
  } else {
    identities.set(object, [path]);
  }
}
function generateReferentialEqualityAnnotations(identitites, dedupe) {
  const result = {};
  let rootEqualityPaths = void 0;
  identitites.forEach((paths) => {
    if (paths.length <= 1) {
      return;
    }
    if (!dedupe) {
      paths = paths.map((path) => path.map(String)).sort((a, b) => a.length - b.length);
    }
    const [representativePath, ...identicalPaths] = paths;
    if (representativePath.length === 0) {
      rootEqualityPaths = identicalPaths.map(stringifyPath);
    } else {
      result[stringifyPath(representativePath)] = identicalPaths.map(stringifyPath);
    }
  });
  if (rootEqualityPaths) {
    if (isEmptyObject(result)) {
      return [rootEqualityPaths];
    } else {
      return [rootEqualityPaths, result];
    }
  } else {
    return isEmptyObject(result) ? void 0 : result;
  }
}
var walker = (object, identities, superJson, dedupe, path = [], objectsInThisPath = [], seenObjects = /* @__PURE__ */ new Map()) => {
  const primitive = isPrimitive(object);
  if (!primitive) {
    addIdentity(object, path, identities);
    const seen = seenObjects.get(object);
    if (seen) {
      return dedupe ? {
        transformedValue: null
      } : seen;
    }
  }
  if (!isDeep(object, superJson)) {
    const transformed2 = transformValue(object, superJson);
    const result2 = transformed2 ? {
      transformedValue: transformed2.value,
      annotations: [transformed2.type]
    } : {
      transformedValue: object
    };
    if (!primitive) {
      seenObjects.set(object, result2);
    }
    return result2;
  }
  if (includes(objectsInThisPath, object)) {
    return {
      transformedValue: null
    };
  }
  const transformationResult = transformValue(object, superJson);
  const transformed = transformationResult?.value ?? object;
  const transformedValue = isArray(transformed) ? [] : {};
  const innerAnnotations = {};
  forEach(transformed, (value, index) => {
    if (index === "__proto__" || index === "constructor" || index === "prototype") {
      throw new Error(`Detected property ${index}. This is a prototype pollution risk, please remove it from your object.`);
    }
    const recursiveResult = walker(value, identities, superJson, dedupe, [...path, index], [...objectsInThisPath, object], seenObjects);
    transformedValue[index] = recursiveResult.transformedValue;
    if (isArray(recursiveResult.annotations)) {
      innerAnnotations[index] = recursiveResult.annotations;
    } else if (isPlainObject(recursiveResult.annotations)) {
      forEach(recursiveResult.annotations, (tree, key) => {
        innerAnnotations[escapeKey(index) + "." + key] = tree;
      });
    }
  });
  const result = isEmptyObject(innerAnnotations) ? {
    transformedValue,
    annotations: !!transformationResult ? [transformationResult.type] : void 0
  } : {
    transformedValue,
    annotations: !!transformationResult ? [transformationResult.type, innerAnnotations] : innerAnnotations
  };
  if (!primitive) {
    seenObjects.set(object, result);
  }
  return result;
};

// ../../node_modules/.pnpm/is-what@4.1.16/node_modules/is-what/dist/index.js
function getType2(payload) {
  return Object.prototype.toString.call(payload).slice(8, -1);
}
function isArray2(payload) {
  return getType2(payload) === "Array";
}
function isPlainObject2(payload) {
  if (getType2(payload) !== "Object")
    return false;
  const prototype = Object.getPrototypeOf(payload);
  return !!prototype && prototype.constructor === Object && prototype === Object.prototype;
}

// ../../node_modules/.pnpm/copy-anything@3.0.5/node_modules/copy-anything/dist/index.js
function assignProp(carry, key, newVal, originalObject, includeNonenumerable) {
  const propType = {}.propertyIsEnumerable.call(originalObject, key) ? "enumerable" : "nonenumerable";
  if (propType === "enumerable")
    carry[key] = newVal;
  if (includeNonenumerable && propType === "nonenumerable") {
    Object.defineProperty(carry, key, {
      value: newVal,
      enumerable: false,
      writable: true,
      configurable: true
    });
  }
}
function copy(target, options = {}) {
  if (isArray2(target)) {
    return target.map((item) => copy(item, options));
  }
  if (!isPlainObject2(target)) {
    return target;
  }
  const props = Object.getOwnPropertyNames(target);
  const symbols = Object.getOwnPropertySymbols(target);
  return [...props, ...symbols].reduce((carry, key) => {
    if (isArray2(options.props) && !options.props.includes(key)) {
      return carry;
    }
    const val = target[key];
    const newVal = copy(val, options);
    assignProp(carry, key, newVal, target, options.nonenumerable);
    return carry;
  }, {});
}

// ../../node_modules/.pnpm/superjson@2.2.2/node_modules/superjson/dist/index.js
var SuperJSON = class {
  /**
   * @param dedupeReferentialEqualities  If true, SuperJSON will make sure only one instance of referentially equal objects are serialized and the rest are replaced with `null`.
   */
  constructor({ dedupe = false } = {}) {
    this.classRegistry = new ClassRegistry();
    this.symbolRegistry = new Registry((s) => s.description ?? "");
    this.customTransformerRegistry = new CustomTransformerRegistry();
    this.allowedErrorProps = [];
    this.dedupe = dedupe;
  }
  serialize(object) {
    const identities = /* @__PURE__ */ new Map();
    const output = walker(object, identities, this, this.dedupe);
    const res = {
      json: output.transformedValue
    };
    if (output.annotations) {
      res.meta = {
        ...res.meta,
        values: output.annotations
      };
    }
    const equalityAnnotations = generateReferentialEqualityAnnotations(identities, this.dedupe);
    if (equalityAnnotations) {
      res.meta = {
        ...res.meta,
        referentialEqualities: equalityAnnotations
      };
    }
    return res;
  }
  deserialize(payload) {
    const { json, meta } = payload;
    let result = copy(json);
    if (meta?.values) {
      result = applyValueAnnotations(result, meta.values, this);
    }
    if (meta?.referentialEqualities) {
      result = applyReferentialEqualityAnnotations(result, meta.referentialEqualities);
    }
    return result;
  }
  stringify(object) {
    return JSON.stringify(this.serialize(object));
  }
  parse(string) {
    return this.deserialize(JSON.parse(string));
  }
  registerClass(v, options) {
    this.classRegistry.register(v, options);
  }
  registerSymbol(v, identifier) {
    this.symbolRegistry.register(v, identifier);
  }
  registerCustom(transformer, name) {
    this.customTransformerRegistry.register({
      name,
      ...transformer
    });
  }
  allowErrorProps(...props) {
    this.allowedErrorProps.push(...props);
  }
};
SuperJSON.defaultInstance = new SuperJSON();
SuperJSON.serialize = SuperJSON.defaultInstance.serialize.bind(SuperJSON.defaultInstance);
SuperJSON.deserialize = SuperJSON.defaultInstance.deserialize.bind(SuperJSON.defaultInstance);
SuperJSON.stringify = SuperJSON.defaultInstance.stringify.bind(SuperJSON.defaultInstance);
SuperJSON.parse = SuperJSON.defaultInstance.parse.bind(SuperJSON.defaultInstance);
SuperJSON.registerClass = SuperJSON.defaultInstance.registerClass.bind(SuperJSON.defaultInstance);
SuperJSON.registerSymbol = SuperJSON.defaultInstance.registerSymbol.bind(SuperJSON.defaultInstance);
SuperJSON.registerCustom = SuperJSON.defaultInstance.registerCustom.bind(SuperJSON.defaultInstance);
SuperJSON.allowErrorProps = SuperJSON.defaultInstance.allowErrorProps.bind(SuperJSON.defaultInstance);
var stringify = SuperJSON.stringify;

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/Options.js
var ignoreOverride = Symbol("Let zodToJsonSchema decide on which parser to use");
var defaultOptions = {
  name: void 0,
  $refStrategy: "root",
  basePath: ["#"],
  effectStrategy: "input",
  pipeStrategy: "all",
  dateStrategy: "format:date-time",
  mapStrategy: "entries",
  removeAdditionalStrategy: "passthrough",
  allowedAdditionalProperties: true,
  rejectedAdditionalProperties: false,
  definitionPath: "definitions",
  target: "jsonSchema7",
  strictUnions: false,
  definitions: {},
  errorMessages: false,
  markdownDescription: false,
  patternStrategy: "escape",
  applyRegexFlags: false,
  emailStrategy: "format:email",
  base64Strategy: "contentEncoding:base64",
  nameStrategy: "ref"
};
var getDefaultOptions = (options) => typeof options === "string" ? {
  ...defaultOptions,
  name: options
} : {
  ...defaultOptions,
  ...options
};

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/Refs.js
var getRefs = (options) => {
  const _options = getDefaultOptions(options);
  const currentPath = _options.name !== void 0 ? [..._options.basePath, _options.definitionPath, _options.name] : _options.basePath;
  return {
    ..._options,
    currentPath,
    propertyPath: void 0,
    seen: new Map(Object.entries(_options.definitions).map(([name, def]) => [
      def._def,
      {
        def: def._def,
        path: [..._options.basePath, _options.definitionPath, name],
        // Resolution of references will be forced even though seen, so it's ok that the schema is undefined here for now.
        jsonSchema: void 0
      }
    ]))
  };
};

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/errorMessages.js
function addErrorMessage(res, key, errorMessage, refs) {
  if (!refs?.errorMessages)
    return;
  if (errorMessage) {
    res.errorMessage = {
      ...res.errorMessage,
      [key]: errorMessage
    };
  }
}
function setResponseValueAndErrors(res, key, value, errorMessage, refs) {
  res[key] = value;
  addErrorMessage(res, key, errorMessage, refs);
}

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/any.js
function parseAnyDef() {
  return {};
}
function parseArrayDef(def, refs) {
  const res = {
    type: "array"
  };
  if (def.type?._def && def.type?._def?.typeName !== lib.ZodFirstPartyTypeKind.ZodAny) {
    res.items = parseDef(def.type._def, {
      ...refs,
      currentPath: [...refs.currentPath, "items"]
    });
  }
  if (def.minLength) {
    setResponseValueAndErrors(res, "minItems", def.minLength.value, def.minLength.message, refs);
  }
  if (def.maxLength) {
    setResponseValueAndErrors(res, "maxItems", def.maxLength.value, def.maxLength.message, refs);
  }
  if (def.exactLength) {
    setResponseValueAndErrors(res, "minItems", def.exactLength.value, def.exactLength.message, refs);
    setResponseValueAndErrors(res, "maxItems", def.exactLength.value, def.exactLength.message, refs);
  }
  return res;
}

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/bigint.js
function parseBigintDef(def, refs) {
  const res = {
    type: "integer",
    format: "int64"
  };
  if (!def.checks)
    return res;
  for (const check of def.checks) {
    switch (check.kind) {
      case "min":
        if (refs.target === "jsonSchema7") {
          if (check.inclusive) {
            setResponseValueAndErrors(res, "minimum", check.value, check.message, refs);
          } else {
            setResponseValueAndErrors(res, "exclusiveMinimum", check.value, check.message, refs);
          }
        } else {
          if (!check.inclusive) {
            res.exclusiveMinimum = true;
          }
          setResponseValueAndErrors(res, "minimum", check.value, check.message, refs);
        }
        break;
      case "max":
        if (refs.target === "jsonSchema7") {
          if (check.inclusive) {
            setResponseValueAndErrors(res, "maximum", check.value, check.message, refs);
          } else {
            setResponseValueAndErrors(res, "exclusiveMaximum", check.value, check.message, refs);
          }
        } else {
          if (!check.inclusive) {
            res.exclusiveMaximum = true;
          }
          setResponseValueAndErrors(res, "maximum", check.value, check.message, refs);
        }
        break;
      case "multipleOf":
        setResponseValueAndErrors(res, "multipleOf", check.value, check.message, refs);
        break;
    }
  }
  return res;
}

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/boolean.js
function parseBooleanDef() {
  return {
    type: "boolean"
  };
}

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/branded.js
function parseBrandedDef(_def, refs) {
  return parseDef(_def.type._def, refs);
}

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/catch.js
var parseCatchDef = (def, refs) => {
  return parseDef(def.innerType._def, refs);
};

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/date.js
function parseDateDef(def, refs, overrideDateStrategy) {
  const strategy = overrideDateStrategy ?? refs.dateStrategy;
  if (Array.isArray(strategy)) {
    return {
      anyOf: strategy.map((item, i) => parseDateDef(def, refs, item))
    };
  }
  switch (strategy) {
    case "string":
    case "format:date-time":
      return {
        type: "string",
        format: "date-time"
      };
    case "format:date":
      return {
        type: "string",
        format: "date"
      };
    case "integer":
      return integerDateParser(def, refs);
  }
}
var integerDateParser = (def, refs) => {
  const res = {
    type: "integer",
    format: "unix-time"
  };
  if (refs.target === "openApi3") {
    return res;
  }
  for (const check of def.checks) {
    switch (check.kind) {
      case "min":
        setResponseValueAndErrors(
          res,
          "minimum",
          check.value,
          // This is in milliseconds
          check.message,
          refs
        );
        break;
      case "max":
        setResponseValueAndErrors(
          res,
          "maximum",
          check.value,
          // This is in milliseconds
          check.message,
          refs
        );
        break;
    }
  }
  return res;
};

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/default.js
function parseDefaultDef(_def, refs) {
  return {
    ...parseDef(_def.innerType._def, refs),
    default: _def.defaultValue()
  };
}

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/effects.js
function parseEffectsDef(_def, refs) {
  return refs.effectStrategy === "input" ? parseDef(_def.schema._def, refs) : {};
}

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/enum.js
function parseEnumDef(def) {
  return {
    type: "string",
    enum: Array.from(def.values)
  };
}

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/intersection.js
var isJsonSchema7AllOfType = (type) => {
  if ("type" in type && type.type === "string")
    return false;
  return "allOf" in type;
};
function parseIntersectionDef(def, refs) {
  const allOf = [
    parseDef(def.left._def, {
      ...refs,
      currentPath: [...refs.currentPath, "allOf", "0"]
    }),
    parseDef(def.right._def, {
      ...refs,
      currentPath: [...refs.currentPath, "allOf", "1"]
    })
  ].filter((x) => !!x);
  let unevaluatedProperties = refs.target === "jsonSchema2019-09" ? { unevaluatedProperties: false } : void 0;
  const mergedAllOf = [];
  allOf.forEach((schema) => {
    if (isJsonSchema7AllOfType(schema)) {
      mergedAllOf.push(...schema.allOf);
      if (schema.unevaluatedProperties === void 0) {
        unevaluatedProperties = void 0;
      }
    } else {
      let nestedSchema = schema;
      if ("additionalProperties" in schema && schema.additionalProperties === false) {
        const { additionalProperties, ...rest } = schema;
        nestedSchema = rest;
      } else {
        unevaluatedProperties = void 0;
      }
      mergedAllOf.push(nestedSchema);
    }
  });
  return mergedAllOf.length ? {
    allOf: mergedAllOf,
    ...unevaluatedProperties
  } : void 0;
}

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/literal.js
function parseLiteralDef(def, refs) {
  const parsedType = typeof def.value;
  if (parsedType !== "bigint" && parsedType !== "number" && parsedType !== "boolean" && parsedType !== "string") {
    return {
      type: Array.isArray(def.value) ? "array" : "object"
    };
  }
  if (refs.target === "openApi3") {
    return {
      type: parsedType === "bigint" ? "integer" : parsedType,
      enum: [def.value]
    };
  }
  return {
    type: parsedType === "bigint" ? "integer" : parsedType,
    const: def.value
  };
}

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/string.js
var emojiRegex = void 0;
var zodPatterns = {
  /**
   * `c` was changed to `[cC]` to replicate /i flag
   */
  cuid: /^[cC][^\s-]{8,}$/,
  cuid2: /^[0-9a-z]+$/,
  ulid: /^[0-9A-HJKMNP-TV-Z]{26}$/,
  /**
   * `a-z` was added to replicate /i flag
   */
  email: /^(?!\.)(?!.*\.\.)([a-zA-Z0-9_'+\-\.]*)[a-zA-Z0-9_+-]@([a-zA-Z0-9][a-zA-Z0-9\-]*\.)+[a-zA-Z]{2,}$/,
  /**
   * Constructed a valid Unicode RegExp
   *
   * Lazily instantiate since this type of regex isn't supported
   * in all envs (e.g. React Native).
   *
   * See:
   * https://github.com/colinhacks/zod/issues/2433
   * Fix in Zod:
   * https://github.com/colinhacks/zod/commit/9340fd51e48576a75adc919bff65dbc4a5d4c99b
   */
  emoji: () => {
    if (emojiRegex === void 0) {
      emojiRegex = RegExp("^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$", "u");
    }
    return emojiRegex;
  },
  /**
   * Unused
   */
  uuid: /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/,
  /**
   * Unused
   */
  ipv4: /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/,
  ipv4Cidr: /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/,
  /**
   * Unused
   */
  ipv6: /^(([a-f0-9]{1,4}:){7}|::([a-f0-9]{1,4}:){0,6}|([a-f0-9]{1,4}:){1}:([a-f0-9]{1,4}:){0,5}|([a-f0-9]{1,4}:){2}:([a-f0-9]{1,4}:){0,4}|([a-f0-9]{1,4}:){3}:([a-f0-9]{1,4}:){0,3}|([a-f0-9]{1,4}:){4}:([a-f0-9]{1,4}:){0,2}|([a-f0-9]{1,4}:){5}:([a-f0-9]{1,4}:){0,1})([a-f0-9]{1,4}|(((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\.){3}((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2})))$/,
  ipv6Cidr: /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,
  base64: /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/,
  base64url: /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/,
  nanoid: /^[a-zA-Z0-9_-]{21}$/,
  jwt: /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/
};
function parseStringDef(def, refs) {
  const res = {
    type: "string"
  };
  if (def.checks) {
    for (const check of def.checks) {
      switch (check.kind) {
        case "min":
          setResponseValueAndErrors(res, "minLength", typeof res.minLength === "number" ? Math.max(res.minLength, check.value) : check.value, check.message, refs);
          break;
        case "max":
          setResponseValueAndErrors(res, "maxLength", typeof res.maxLength === "number" ? Math.min(res.maxLength, check.value) : check.value, check.message, refs);
          break;
        case "email":
          switch (refs.emailStrategy) {
            case "format:email":
              addFormat(res, "email", check.message, refs);
              break;
            case "format:idn-email":
              addFormat(res, "idn-email", check.message, refs);
              break;
            case "pattern:zod":
              addPattern(res, zodPatterns.email, check.message, refs);
              break;
          }
          break;
        case "url":
          addFormat(res, "uri", check.message, refs);
          break;
        case "uuid":
          addFormat(res, "uuid", check.message, refs);
          break;
        case "regex":
          addPattern(res, check.regex, check.message, refs);
          break;
        case "cuid":
          addPattern(res, zodPatterns.cuid, check.message, refs);
          break;
        case "cuid2":
          addPattern(res, zodPatterns.cuid2, check.message, refs);
          break;
        case "startsWith":
          addPattern(res, RegExp(`^${escapeLiteralCheckValue(check.value, refs)}`), check.message, refs);
          break;
        case "endsWith":
          addPattern(res, RegExp(`${escapeLiteralCheckValue(check.value, refs)}$`), check.message, refs);
          break;
        case "datetime":
          addFormat(res, "date-time", check.message, refs);
          break;
        case "date":
          addFormat(res, "date", check.message, refs);
          break;
        case "time":
          addFormat(res, "time", check.message, refs);
          break;
        case "duration":
          addFormat(res, "duration", check.message, refs);
          break;
        case "length":
          setResponseValueAndErrors(res, "minLength", typeof res.minLength === "number" ? Math.max(res.minLength, check.value) : check.value, check.message, refs);
          setResponseValueAndErrors(res, "maxLength", typeof res.maxLength === "number" ? Math.min(res.maxLength, check.value) : check.value, check.message, refs);
          break;
        case "includes": {
          addPattern(res, RegExp(escapeLiteralCheckValue(check.value, refs)), check.message, refs);
          break;
        }
        case "ip": {
          if (check.version !== "v6") {
            addFormat(res, "ipv4", check.message, refs);
          }
          if (check.version !== "v4") {
            addFormat(res, "ipv6", check.message, refs);
          }
          break;
        }
        case "base64url":
          addPattern(res, zodPatterns.base64url, check.message, refs);
          break;
        case "jwt":
          addPattern(res, zodPatterns.jwt, check.message, refs);
          break;
        case "cidr": {
          if (check.version !== "v6") {
            addPattern(res, zodPatterns.ipv4Cidr, check.message, refs);
          }
          if (check.version !== "v4") {
            addPattern(res, zodPatterns.ipv6Cidr, check.message, refs);
          }
          break;
        }
        case "emoji":
          addPattern(res, zodPatterns.emoji(), check.message, refs);
          break;
        case "ulid": {
          addPattern(res, zodPatterns.ulid, check.message, refs);
          break;
        }
        case "base64": {
          switch (refs.base64Strategy) {
            case "format:binary": {
              addFormat(res, "binary", check.message, refs);
              break;
            }
            case "contentEncoding:base64": {
              setResponseValueAndErrors(res, "contentEncoding", "base64", check.message, refs);
              break;
            }
            case "pattern:zod": {
              addPattern(res, zodPatterns.base64, check.message, refs);
              break;
            }
          }
          break;
        }
        case "nanoid": {
          addPattern(res, zodPatterns.nanoid, check.message, refs);
        }
      }
    }
  }
  return res;
}
function escapeLiteralCheckValue(literal, refs) {
  return refs.patternStrategy === "escape" ? escapeNonAlphaNumeric(literal) : literal;
}
var ALPHA_NUMERIC = new Set("ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvxyz0123456789");
function escapeNonAlphaNumeric(source) {
  let result = "";
  for (let i = 0; i < source.length; i++) {
    if (!ALPHA_NUMERIC.has(source[i])) {
      result += "\\";
    }
    result += source[i];
  }
  return result;
}
function addFormat(schema, value, message, refs) {
  if (schema.format || schema.anyOf?.some((x) => x.format)) {
    if (!schema.anyOf) {
      schema.anyOf = [];
    }
    if (schema.format) {
      schema.anyOf.push({
        format: schema.format,
        ...schema.errorMessage && refs.errorMessages && {
          errorMessage: { format: schema.errorMessage.format }
        }
      });
      delete schema.format;
      if (schema.errorMessage) {
        delete schema.errorMessage.format;
        if (Object.keys(schema.errorMessage).length === 0) {
          delete schema.errorMessage;
        }
      }
    }
    schema.anyOf.push({
      format: value,
      ...message && refs.errorMessages && { errorMessage: { format: message } }
    });
  } else {
    setResponseValueAndErrors(schema, "format", value, message, refs);
  }
}
function addPattern(schema, regex, message, refs) {
  if (schema.pattern || schema.allOf?.some((x) => x.pattern)) {
    if (!schema.allOf) {
      schema.allOf = [];
    }
    if (schema.pattern) {
      schema.allOf.push({
        pattern: schema.pattern,
        ...schema.errorMessage && refs.errorMessages && {
          errorMessage: { pattern: schema.errorMessage.pattern }
        }
      });
      delete schema.pattern;
      if (schema.errorMessage) {
        delete schema.errorMessage.pattern;
        if (Object.keys(schema.errorMessage).length === 0) {
          delete schema.errorMessage;
        }
      }
    }
    schema.allOf.push({
      pattern: stringifyRegExpWithFlags(regex, refs),
      ...message && refs.errorMessages && { errorMessage: { pattern: message } }
    });
  } else {
    setResponseValueAndErrors(schema, "pattern", stringifyRegExpWithFlags(regex, refs), message, refs);
  }
}
function stringifyRegExpWithFlags(regex, refs) {
  if (!refs.applyRegexFlags || !regex.flags) {
    return regex.source;
  }
  const flags = {
    i: regex.flags.includes("i"),
    m: regex.flags.includes("m"),
    s: regex.flags.includes("s")
    // `.` matches newlines
  };
  const source = flags.i ? regex.source.toLowerCase() : regex.source;
  let pattern = "";
  let isEscaped = false;
  let inCharGroup = false;
  let inCharRange = false;
  for (let i = 0; i < source.length; i++) {
    if (isEscaped) {
      pattern += source[i];
      isEscaped = false;
      continue;
    }
    if (flags.i) {
      if (inCharGroup) {
        if (source[i].match(/[a-z]/)) {
          if (inCharRange) {
            pattern += source[i];
            pattern += `${source[i - 2]}-${source[i]}`.toUpperCase();
            inCharRange = false;
          } else if (source[i + 1] === "-" && source[i + 2]?.match(/[a-z]/)) {
            pattern += source[i];
            inCharRange = true;
          } else {
            pattern += `${source[i]}${source[i].toUpperCase()}`;
          }
          continue;
        }
      } else if (source[i].match(/[a-z]/)) {
        pattern += `[${source[i]}${source[i].toUpperCase()}]`;
        continue;
      }
    }
    if (flags.m) {
      if (source[i] === "^") {
        pattern += `(^|(?<=[\r
]))`;
        continue;
      } else if (source[i] === "$") {
        pattern += `($|(?=[\r
]))`;
        continue;
      }
    }
    if (flags.s && source[i] === ".") {
      pattern += inCharGroup ? `${source[i]}\r
` : `[${source[i]}\r
]`;
      continue;
    }
    pattern += source[i];
    if (source[i] === "\\") {
      isEscaped = true;
    } else if (inCharGroup && source[i] === "]") {
      inCharGroup = false;
    } else if (!inCharGroup && source[i] === "[") {
      inCharGroup = true;
    }
  }
  return pattern;
}

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/record.js
function parseRecordDef(def, refs) {
  if (refs.target === "openAi") {
    console.warn("Warning: OpenAI may not support records in schemas! Try an array of key-value pairs instead.");
  }
  if (refs.target === "openApi3" && def.keyType?._def.typeName === lib.ZodFirstPartyTypeKind.ZodEnum) {
    return {
      type: "object",
      required: def.keyType._def.values,
      properties: def.keyType._def.values.reduce((acc, key) => ({
        ...acc,
        [key]: parseDef(def.valueType._def, {
          ...refs,
          currentPath: [...refs.currentPath, "properties", key]
        }) ?? {}
      }), {}),
      additionalProperties: refs.rejectedAdditionalProperties
    };
  }
  const schema = {
    type: "object",
    additionalProperties: parseDef(def.valueType._def, {
      ...refs,
      currentPath: [...refs.currentPath, "additionalProperties"]
    }) ?? refs.allowedAdditionalProperties
  };
  if (refs.target === "openApi3") {
    return schema;
  }
  if (def.keyType?._def.typeName === lib.ZodFirstPartyTypeKind.ZodString && def.keyType._def.checks?.length) {
    const { type, ...keyType } = parseStringDef(def.keyType._def, refs);
    return {
      ...schema,
      propertyNames: keyType
    };
  } else if (def.keyType?._def.typeName === lib.ZodFirstPartyTypeKind.ZodEnum) {
    return {
      ...schema,
      propertyNames: {
        enum: def.keyType._def.values
      }
    };
  } else if (def.keyType?._def.typeName === lib.ZodFirstPartyTypeKind.ZodBranded && def.keyType._def.type._def.typeName === lib.ZodFirstPartyTypeKind.ZodString && def.keyType._def.type._def.checks?.length) {
    const { type, ...keyType } = parseBrandedDef(def.keyType._def, refs);
    return {
      ...schema,
      propertyNames: keyType
    };
  }
  return schema;
}

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/map.js
function parseMapDef(def, refs) {
  if (refs.mapStrategy === "record") {
    return parseRecordDef(def, refs);
  }
  const keys = parseDef(def.keyType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "items", "items", "0"]
  }) || {};
  const values = parseDef(def.valueType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "items", "items", "1"]
  }) || {};
  return {
    type: "array",
    maxItems: 125,
    items: {
      type: "array",
      items: [keys, values],
      minItems: 2,
      maxItems: 2
    }
  };
}

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/nativeEnum.js
function parseNativeEnumDef(def) {
  const object = def.values;
  const actualKeys = Object.keys(def.values).filter((key) => {
    return typeof object[object[key]] !== "number";
  });
  const actualValues = actualKeys.map((key) => object[key]);
  const parsedTypes = Array.from(new Set(actualValues.map((values) => typeof values)));
  return {
    type: parsedTypes.length === 1 ? parsedTypes[0] === "string" ? "string" : "number" : ["string", "number"],
    enum: actualValues
  };
}

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/never.js
function parseNeverDef() {
  return {
    not: {}
  };
}

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/null.js
function parseNullDef(refs) {
  return refs.target === "openApi3" ? {
    enum: ["null"],
    nullable: true
  } : {
    type: "null"
  };
}

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/union.js
var primitiveMappings = {
  ZodString: "string",
  ZodNumber: "number",
  ZodBigInt: "integer",
  ZodBoolean: "boolean",
  ZodNull: "null"
};
function parseUnionDef(def, refs) {
  if (refs.target === "openApi3")
    return asAnyOf(def, refs);
  const options = def.options instanceof Map ? Array.from(def.options.values()) : def.options;
  if (options.every((x) => x._def.typeName in primitiveMappings && (!x._def.checks || !x._def.checks.length))) {
    const types = options.reduce((types2, x) => {
      const type = primitiveMappings[x._def.typeName];
      return type && !types2.includes(type) ? [...types2, type] : types2;
    }, []);
    return {
      type: types.length > 1 ? types : types[0]
    };
  } else if (options.every((x) => x._def.typeName === "ZodLiteral" && !x.description)) {
    const types = options.reduce((acc, x) => {
      const type = typeof x._def.value;
      switch (type) {
        case "string":
        case "number":
        case "boolean":
          return [...acc, type];
        case "bigint":
          return [...acc, "integer"];
        case "object":
          if (x._def.value === null)
            return [...acc, "null"];
        case "symbol":
        case "undefined":
        case "function":
        default:
          return acc;
      }
    }, []);
    if (types.length === options.length) {
      const uniqueTypes = types.filter((x, i, a) => a.indexOf(x) === i);
      return {
        type: uniqueTypes.length > 1 ? uniqueTypes : uniqueTypes[0],
        enum: options.reduce((acc, x) => {
          return acc.includes(x._def.value) ? acc : [...acc, x._def.value];
        }, [])
      };
    }
  } else if (options.every((x) => x._def.typeName === "ZodEnum")) {
    return {
      type: "string",
      enum: options.reduce((acc, x) => [
        ...acc,
        ...x._def.values.filter((x2) => !acc.includes(x2))
      ], [])
    };
  }
  return asAnyOf(def, refs);
}
var asAnyOf = (def, refs) => {
  const anyOf = (def.options instanceof Map ? Array.from(def.options.values()) : def.options).map((x, i) => parseDef(x._def, {
    ...refs,
    currentPath: [...refs.currentPath, "anyOf", `${i}`]
  })).filter((x) => !!x && (!refs.strictUnions || typeof x === "object" && Object.keys(x).length > 0));
  return anyOf.length ? { anyOf } : void 0;
};

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/nullable.js
function parseNullableDef(def, refs) {
  if (["ZodString", "ZodNumber", "ZodBigInt", "ZodBoolean", "ZodNull"].includes(def.innerType._def.typeName) && (!def.innerType._def.checks || !def.innerType._def.checks.length)) {
    if (refs.target === "openApi3") {
      return {
        type: primitiveMappings[def.innerType._def.typeName],
        nullable: true
      };
    }
    return {
      type: [
        primitiveMappings[def.innerType._def.typeName],
        "null"
      ]
    };
  }
  if (refs.target === "openApi3") {
    const base2 = parseDef(def.innerType._def, {
      ...refs,
      currentPath: [...refs.currentPath]
    });
    if (base2 && "$ref" in base2)
      return { allOf: [base2], nullable: true };
    return base2 && { ...base2, nullable: true };
  }
  const base = parseDef(def.innerType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "anyOf", "0"]
  });
  return base && { anyOf: [base, { type: "null" }] };
}

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/number.js
function parseNumberDef(def, refs) {
  const res = {
    type: "number"
  };
  if (!def.checks)
    return res;
  for (const check of def.checks) {
    switch (check.kind) {
      case "int":
        res.type = "integer";
        addErrorMessage(res, "type", check.message, refs);
        break;
      case "min":
        if (refs.target === "jsonSchema7") {
          if (check.inclusive) {
            setResponseValueAndErrors(res, "minimum", check.value, check.message, refs);
          } else {
            setResponseValueAndErrors(res, "exclusiveMinimum", check.value, check.message, refs);
          }
        } else {
          if (!check.inclusive) {
            res.exclusiveMinimum = true;
          }
          setResponseValueAndErrors(res, "minimum", check.value, check.message, refs);
        }
        break;
      case "max":
        if (refs.target === "jsonSchema7") {
          if (check.inclusive) {
            setResponseValueAndErrors(res, "maximum", check.value, check.message, refs);
          } else {
            setResponseValueAndErrors(res, "exclusiveMaximum", check.value, check.message, refs);
          }
        } else {
          if (!check.inclusive) {
            res.exclusiveMaximum = true;
          }
          setResponseValueAndErrors(res, "maximum", check.value, check.message, refs);
        }
        break;
      case "multipleOf":
        setResponseValueAndErrors(res, "multipleOf", check.value, check.message, refs);
        break;
    }
  }
  return res;
}
function parseObjectDef(def, refs) {
  const forceOptionalIntoNullable = refs.target === "openAi";
  const result = {
    type: "object",
    properties: {}
  };
  const required = [];
  const shape = def.shape();
  for (const propName in shape) {
    let propDef = shape[propName];
    if (propDef === void 0 || propDef._def === void 0) {
      continue;
    }
    let propOptional = safeIsOptional(propDef);
    if (propOptional && forceOptionalIntoNullable) {
      if (propDef instanceof lib.ZodOptional) {
        propDef = propDef._def.innerType;
      }
      if (!propDef.isNullable()) {
        propDef = propDef.nullable();
      }
      propOptional = false;
    }
    const parsedDef = parseDef(propDef._def, {
      ...refs,
      currentPath: [...refs.currentPath, "properties", propName],
      propertyPath: [...refs.currentPath, "properties", propName]
    });
    if (parsedDef === void 0) {
      continue;
    }
    result.properties[propName] = parsedDef;
    if (!propOptional) {
      required.push(propName);
    }
  }
  if (required.length) {
    result.required = required;
  }
  const additionalProperties = decideAdditionalProperties(def, refs);
  if (additionalProperties !== void 0) {
    result.additionalProperties = additionalProperties;
  }
  return result;
}
function decideAdditionalProperties(def, refs) {
  if (def.catchall._def.typeName !== "ZodNever") {
    return parseDef(def.catchall._def, {
      ...refs,
      currentPath: [...refs.currentPath, "additionalProperties"]
    });
  }
  switch (def.unknownKeys) {
    case "passthrough":
      return refs.allowedAdditionalProperties;
    case "strict":
      return refs.rejectedAdditionalProperties;
    case "strip":
      return refs.removeAdditionalStrategy === "strict" ? refs.allowedAdditionalProperties : refs.rejectedAdditionalProperties;
  }
}
function safeIsOptional(schema) {
  try {
    return schema.isOptional();
  } catch {
    return true;
  }
}

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/optional.js
var parseOptionalDef = (def, refs) => {
  if (refs.currentPath.toString() === refs.propertyPath?.toString()) {
    return parseDef(def.innerType._def, refs);
  }
  const innerSchema = parseDef(def.innerType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "anyOf", "1"]
  });
  return innerSchema ? {
    anyOf: [
      {
        not: {}
      },
      innerSchema
    ]
  } : {};
};

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/pipeline.js
var parsePipelineDef = (def, refs) => {
  if (refs.pipeStrategy === "input") {
    return parseDef(def.in._def, refs);
  } else if (refs.pipeStrategy === "output") {
    return parseDef(def.out._def, refs);
  }
  const a = parseDef(def.in._def, {
    ...refs,
    currentPath: [...refs.currentPath, "allOf", "0"]
  });
  const b = parseDef(def.out._def, {
    ...refs,
    currentPath: [...refs.currentPath, "allOf", a ? "1" : "0"]
  });
  return {
    allOf: [a, b].filter((x) => x !== void 0)
  };
};

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/promise.js
function parsePromiseDef(def, refs) {
  return parseDef(def.type._def, refs);
}

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/set.js
function parseSetDef(def, refs) {
  const items = parseDef(def.valueType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "items"]
  });
  const schema = {
    type: "array",
    uniqueItems: true,
    items
  };
  if (def.minSize) {
    setResponseValueAndErrors(schema, "minItems", def.minSize.value, def.minSize.message, refs);
  }
  if (def.maxSize) {
    setResponseValueAndErrors(schema, "maxItems", def.maxSize.value, def.maxSize.message, refs);
  }
  return schema;
}

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/tuple.js
function parseTupleDef(def, refs) {
  if (def.rest) {
    return {
      type: "array",
      minItems: def.items.length,
      items: def.items.map((x, i) => parseDef(x._def, {
        ...refs,
        currentPath: [...refs.currentPath, "items", `${i}`]
      })).reduce((acc, x) => x === void 0 ? acc : [...acc, x], []),
      additionalItems: parseDef(def.rest._def, {
        ...refs,
        currentPath: [...refs.currentPath, "additionalItems"]
      })
    };
  } else {
    return {
      type: "array",
      minItems: def.items.length,
      maxItems: def.items.length,
      items: def.items.map((x, i) => parseDef(x._def, {
        ...refs,
        currentPath: [...refs.currentPath, "items", `${i}`]
      })).reduce((acc, x) => x === void 0 ? acc : [...acc, x], [])
    };
  }
}

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/undefined.js
function parseUndefinedDef() {
  return {
    not: {}
  };
}

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/unknown.js
function parseUnknownDef() {
  return {};
}

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parsers/readonly.js
var parseReadonlyDef = (def, refs) => {
  return parseDef(def.innerType._def, refs);
};

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/selectParser.js
var selectParser = (def, typeName, refs) => {
  switch (typeName) {
    case lib.ZodFirstPartyTypeKind.ZodString:
      return parseStringDef(def, refs);
    case lib.ZodFirstPartyTypeKind.ZodNumber:
      return parseNumberDef(def, refs);
    case lib.ZodFirstPartyTypeKind.ZodObject:
      return parseObjectDef(def, refs);
    case lib.ZodFirstPartyTypeKind.ZodBigInt:
      return parseBigintDef(def, refs);
    case lib.ZodFirstPartyTypeKind.ZodBoolean:
      return parseBooleanDef();
    case lib.ZodFirstPartyTypeKind.ZodDate:
      return parseDateDef(def, refs);
    case lib.ZodFirstPartyTypeKind.ZodUndefined:
      return parseUndefinedDef();
    case lib.ZodFirstPartyTypeKind.ZodNull:
      return parseNullDef(refs);
    case lib.ZodFirstPartyTypeKind.ZodArray:
      return parseArrayDef(def, refs);
    case lib.ZodFirstPartyTypeKind.ZodUnion:
    case lib.ZodFirstPartyTypeKind.ZodDiscriminatedUnion:
      return parseUnionDef(def, refs);
    case lib.ZodFirstPartyTypeKind.ZodIntersection:
      return parseIntersectionDef(def, refs);
    case lib.ZodFirstPartyTypeKind.ZodTuple:
      return parseTupleDef(def, refs);
    case lib.ZodFirstPartyTypeKind.ZodRecord:
      return parseRecordDef(def, refs);
    case lib.ZodFirstPartyTypeKind.ZodLiteral:
      return parseLiteralDef(def, refs);
    case lib.ZodFirstPartyTypeKind.ZodEnum:
      return parseEnumDef(def);
    case lib.ZodFirstPartyTypeKind.ZodNativeEnum:
      return parseNativeEnumDef(def);
    case lib.ZodFirstPartyTypeKind.ZodNullable:
      return parseNullableDef(def, refs);
    case lib.ZodFirstPartyTypeKind.ZodOptional:
      return parseOptionalDef(def, refs);
    case lib.ZodFirstPartyTypeKind.ZodMap:
      return parseMapDef(def, refs);
    case lib.ZodFirstPartyTypeKind.ZodSet:
      return parseSetDef(def, refs);
    case lib.ZodFirstPartyTypeKind.ZodLazy:
      return () => def.getter()._def;
    case lib.ZodFirstPartyTypeKind.ZodPromise:
      return parsePromiseDef(def, refs);
    case lib.ZodFirstPartyTypeKind.ZodNaN:
    case lib.ZodFirstPartyTypeKind.ZodNever:
      return parseNeverDef();
    case lib.ZodFirstPartyTypeKind.ZodEffects:
      return parseEffectsDef(def, refs);
    case lib.ZodFirstPartyTypeKind.ZodAny:
      return parseAnyDef();
    case lib.ZodFirstPartyTypeKind.ZodUnknown:
      return parseUnknownDef();
    case lib.ZodFirstPartyTypeKind.ZodDefault:
      return parseDefaultDef(def, refs);
    case lib.ZodFirstPartyTypeKind.ZodBranded:
      return parseBrandedDef(def, refs);
    case lib.ZodFirstPartyTypeKind.ZodReadonly:
      return parseReadonlyDef(def, refs);
    case lib.ZodFirstPartyTypeKind.ZodCatch:
      return parseCatchDef(def, refs);
    case lib.ZodFirstPartyTypeKind.ZodPipeline:
      return parsePipelineDef(def, refs);
    case lib.ZodFirstPartyTypeKind.ZodFunction:
    case lib.ZodFirstPartyTypeKind.ZodVoid:
    case lib.ZodFirstPartyTypeKind.ZodSymbol:
      return void 0;
    default:
      return /* @__PURE__ */ ((_) => void 0)();
  }
};

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/parseDef.js
function parseDef(def, refs, forceResolution = false) {
  const seenItem = refs.seen.get(def);
  if (refs.override) {
    const overrideResult = refs.override?.(def, refs, seenItem, forceResolution);
    if (overrideResult !== ignoreOverride) {
      return overrideResult;
    }
  }
  if (seenItem && !forceResolution) {
    const seenSchema = get$ref(seenItem, refs);
    if (seenSchema !== void 0) {
      return seenSchema;
    }
  }
  const newItem = { def, path: refs.currentPath, jsonSchema: void 0 };
  refs.seen.set(def, newItem);
  const jsonSchemaOrGetter = selectParser(def, def.typeName, refs);
  const jsonSchema = typeof jsonSchemaOrGetter === "function" ? parseDef(jsonSchemaOrGetter(), refs) : jsonSchemaOrGetter;
  if (jsonSchema) {
    addMeta(def, refs, jsonSchema);
  }
  if (refs.postProcess) {
    const postProcessResult = refs.postProcess(jsonSchema, def, refs);
    newItem.jsonSchema = jsonSchema;
    return postProcessResult;
  }
  newItem.jsonSchema = jsonSchema;
  return jsonSchema;
}
var get$ref = (item, refs) => {
  switch (refs.$refStrategy) {
    case "root":
      return { $ref: item.path.join("/") };
    case "relative":
      return { $ref: getRelativePath(refs.currentPath, item.path) };
    case "none":
    case "seen": {
      if (item.path.length < refs.currentPath.length && item.path.every((value, index) => refs.currentPath[index] === value)) {
        console.warn(`Recursive reference detected at ${refs.currentPath.join("/")}! Defaulting to any`);
        return {};
      }
      return refs.$refStrategy === "seen" ? {} : void 0;
    }
  }
};
var getRelativePath = (pathA, pathB) => {
  let i = 0;
  for (; i < pathA.length && i < pathB.length; i++) {
    if (pathA[i] !== pathB[i])
      break;
  }
  return [(pathA.length - i).toString(), ...pathB.slice(i)].join("/");
};
var addMeta = (def, refs, jsonSchema) => {
  if (def.description) {
    jsonSchema.description = def.description;
    if (refs.markdownDescription) {
      jsonSchema.markdownDescription = def.description;
    }
  }
  return jsonSchema;
};

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/zodToJsonSchema.js
var zodToJsonSchema = (schema, options) => {
  const refs = getRefs(options);
  const definitions = typeof options === "object" && options.definitions ? Object.entries(options.definitions).reduce((acc, [name2, schema2]) => ({
    ...acc,
    [name2]: parseDef(schema2._def, {
      ...refs,
      currentPath: [...refs.basePath, refs.definitionPath, name2]
    }, true) ?? {}
  }), {}) : void 0;
  const name = typeof options === "string" ? options : options?.nameStrategy === "title" ? void 0 : options?.name;
  const main = parseDef(schema._def, name === void 0 ? refs : {
    ...refs,
    currentPath: [...refs.basePath, refs.definitionPath, name]
  }, false) ?? {};
  const title = typeof options === "object" && options.name !== void 0 && options.nameStrategy === "title" ? options.name : void 0;
  if (title !== void 0) {
    main.title = title;
  }
  const combined = name === void 0 ? definitions ? {
    ...main,
    [refs.definitionPath]: definitions
  } : main : {
    $ref: [
      ...refs.$refStrategy === "relative" ? [] : refs.basePath,
      refs.definitionPath,
      name
    ].join("/"),
    [refs.definitionPath]: {
      ...definitions,
      [name]: main
    }
  };
  if (refs.target === "jsonSchema7") {
    combined.$schema = "http://json-schema.org/draft-07/schema#";
  } else if (refs.target === "jsonSchema2019-09" || refs.target === "openAi") {
    combined.$schema = "https://json-schema.org/draft/2019-09/schema#";
  }
  if (refs.target === "openAi" && ("anyOf" in combined || "oneOf" in combined || "allOf" in combined || "type" in combined && Array.isArray(combined.type))) {
    console.warn("Warning: OpenAI may not support schemas with unions as roots! Try wrapping it in an object property.");
  }
  return combined;
};

// ../../node_modules/.pnpm/zod-to-json-schema@3.24.5_zod@3.24.4/node_modules/zod-to-json-schema/dist/esm/index.js
var esm_default = zodToJsonSchema;

// src/server/http-exception.ts
var HTTPException = class extends Error {
  res;
  status;
  /**
   * Creates an instance of `HTTPException`.
   * @param status - HTTP status code for the exception. Defaults to 500.
   * @param options - Additional options for the exception.
   */
  constructor(status = 500, options) {
    super(options?.message, { cause: options?.cause });
    this.res = options?.res;
    this.status = status;
  }
  /**
   * Returns the response object associated with the exception.
   * If a response object is not provided, a new response is created with the error message and status code.
   * @returns The response object.
   */
  getResponse() {
    if (this.res) {
      const newResponse = new Response(this.res.body, {
        status: this.status,
        headers: this.res.headers
      });
      return newResponse;
    }
    return new Response(this.message, {
      status: this.status
    });
  }
};

// src/server/handlers/utils.ts
function validateBody(body) {
  const errorResponse = Object.entries(body).reduce((acc, [key, value]) => {
    if (!value) {
      acc[key] = `Argument "${key}" is required`;
    }
    return acc;
  }, {});
  if (Object.keys(errorResponse).length > 0) {
    throw new HTTPException(400, { message: Object.values(errorResponse)[0] });
  }
}

// src/server/handlers/error.ts
function handleError$1(error, defaultMessage) {
  const apiError = error;
  throw new HTTPException(apiError.status || 500, {
    message: apiError.message || defaultMessage
  });
}

// src/server/handlers/agents.ts
var agents_exports = {};
__export(agents_exports, {
  generateHandler: () => generateHandler$2,
  getAgentByIdHandler: () => getAgentByIdHandler$1,
  getAgentsHandler: () => getAgentsHandler$1,
  getEvalsByAgentIdHandler: () => getEvalsByAgentIdHandler$1,
  getLiveEvalsByAgentIdHandler: () => getLiveEvalsByAgentIdHandler$1,
  streamGenerateHandler: () => streamGenerateHandler$2
});
async function getAgentsHandler$1({ mastra, runtimeContext }) {
  try {
    const agents = mastra.getAgents();
    const serializedAgentsMap = await Promise.all(
      Object.entries(agents).map(async ([id, agent]) => {
        const instructions = await agent.getInstructions({ runtimeContext });
        const tools = await agent.getTools({ runtimeContext });
        const llm = await agent.getLLM({ runtimeContext });
        const serializedAgentTools = Object.entries(tools || {}).reduce((acc, [key, tool]) => {
          const _tool = tool;
          acc[key] = {
            ..._tool,
            inputSchema: _tool.inputSchema ? stringify(esm_default(_tool.inputSchema)) : void 0,
            outputSchema: _tool.outputSchema ? stringify(esm_default(_tool.outputSchema)) : void 0
          };
          return acc;
        }, {});
        let serializedAgentWorkflows = {};
        if ("getWorkflows" in agent) {
          const logger = mastra.getLogger();
          try {
            const workflows = await agent.getWorkflows({ runtimeContext });
            serializedAgentWorkflows = Object.entries(workflows || {}).reduce((acc, [key, workflow]) => {
              return {
                ...acc,
                [key]: {
                  name: workflow.name
                }
              };
            }, {});
          } catch (error) {
            logger.error("Error getting workflows for agent", { agentName: agent.name, error });
          }
        }
        return {
          id,
          name: agent.name,
          instructions,
          tools: serializedAgentTools,
          workflows: serializedAgentWorkflows,
          provider: llm?.getProvider(),
          modelId: llm?.getModelId()
        };
      })
    );
    const serializedAgents = serializedAgentsMap.reduce((acc, { id, ...rest }) => {
      acc[id] = rest;
      return acc;
    }, {});
    return serializedAgents;
  } catch (error) {
    return handleError$1(error, "Error getting agents");
  }
}
async function getAgentByIdHandler$1({
  mastra,
  runtimeContext,
  agentId
}) {
  try {
    const agent = mastra.getAgent(agentId);
    if (!agent) {
      throw new HTTPException(404, { message: "Agent not found" });
    }
    const tools = await agent.getTools({ runtimeContext });
    const serializedAgentTools = Object.entries(tools || {}).reduce((acc, [key, tool]) => {
      const _tool = tool;
      acc[key] = {
        ..._tool,
        inputSchema: _tool.inputSchema ? stringify(esm_default(_tool.inputSchema)) : void 0,
        outputSchema: _tool.outputSchema ? stringify(esm_default(_tool.outputSchema)) : void 0
      };
      return acc;
    }, {});
    let serializedAgentWorkflows = {};
    if ("getWorkflows" in agent) {
      const logger = mastra.getLogger();
      try {
        const workflows = await agent.getWorkflows({ runtimeContext });
        serializedAgentWorkflows = Object.entries(workflows || {}).reduce((acc, [key, workflow]) => {
          return {
            ...acc,
            [key]: {
              name: workflow.name
            }
          };
        }, {});
      } catch (error) {
        logger.error("Error getting workflows for agent", { agentName: agent.name, error });
      }
    }
    const instructions = await agent.getInstructions({ runtimeContext });
    const llm = await agent.getLLM({ runtimeContext });
    return {
      name: agent.name,
      instructions,
      tools: serializedAgentTools,
      workflows: serializedAgentWorkflows,
      provider: llm?.getProvider(),
      modelId: llm?.getModelId()
    };
  } catch (error) {
    return handleError$1(error, "Error getting agent");
  }
}
async function getEvalsByAgentIdHandler$1({
  mastra,
  runtimeContext,
  agentId
}) {
  try {
    const agent = mastra.getAgent(agentId);
    const evals = await mastra.getStorage()?.getEvalsByAgentName?.(agent.name, "test") || [];
    const instructions = await agent.getInstructions({ runtimeContext });
    return {
      id: agentId,
      name: agent.name,
      instructions,
      evals
    };
  } catch (error) {
    return handleError$1(error, "Error getting test evals");
  }
}
async function getLiveEvalsByAgentIdHandler$1({
  mastra,
  runtimeContext,
  agentId
}) {
  try {
    const agent = mastra.getAgent(agentId);
    const evals = await mastra.getStorage()?.getEvalsByAgentName?.(agent.name, "live") || [];
    const instructions = await agent.getInstructions({ runtimeContext });
    return {
      id: agentId,
      name: agent.name,
      instructions,
      evals
    };
  } catch (error) {
    return handleError$1(error, "Error getting live evals");
  }
}
async function generateHandler$2({
  mastra,
  runtimeContext,
  agentId,
  body
}) {
  try {
    const agent = mastra.getAgent(agentId);
    if (!agent) {
      throw new HTTPException(404, { message: "Agent not found" });
    }
    const { messages, resourceId, resourceid, runtimeContext: agentRuntimeContext, ...rest } = body;
    const finalResourceId = resourceId ?? resourceid;
    const finalRuntimeContext = new RuntimeContext([
      ...Array.from(runtimeContext.entries()),
      ...Array.from(Object.entries(agentRuntimeContext ?? {}))
    ]);
    validateBody({ messages });
    const result = await agent.generate(messages, {
      ...rest,
      // @ts-expect-error TODO fix types
      resourceId: finalResourceId,
      runtimeContext: finalRuntimeContext
    });
    return result;
  } catch (error) {
    return handleError$1(error, "Error generating from agent");
  }
}
async function streamGenerateHandler$2({
  mastra,
  runtimeContext,
  agentId,
  body
}) {
  try {
    const agent = mastra.getAgent(agentId);
    if (!agent) {
      throw new HTTPException(404, { message: "Agent not found" });
    }
    const { messages, resourceId, resourceid, runtimeContext: agentRuntimeContext, ...rest } = body;
    const finalResourceId = resourceId ?? resourceid;
    const finalRuntimeContext = new RuntimeContext([
      ...Array.from(runtimeContext.entries()),
      ...Array.from(Object.entries(agentRuntimeContext ?? {}))
    ]);
    validateBody({ messages });
    const streamResult = await agent.stream(messages, {
      ...rest,
      // @ts-expect-error TODO fix types
      resourceId: finalResourceId,
      runtimeContext: finalRuntimeContext
    });
    const streamResponse = rest.output ? streamResult.toTextStreamResponse() : streamResult.toDataStreamResponse({
      sendUsage: true,
      sendReasoning: true,
      getErrorMessage: (error) => {
        return `An error occurred while processing your request. ${error instanceof Error ? error.message : JSON.stringify(error)}`;
      }
    });
    return streamResponse;
  } catch (error) {
    throw new HTTPException(error?.status ?? 500, { message: error?.message ?? "Error streaming from agent" });
  }
}

// src/server/handlers/logs.ts
var logs_exports = {};
__export(logs_exports, {
  getLogTransports: () => getLogTransports$1,
  getLogsByRunIdHandler: () => getLogsByRunIdHandler$1,
  getLogsHandler: () => getLogsHandler$1
});
async function getLogsHandler$1({
  mastra,
  transportId
}) {
  try {
    validateBody({ transportId });
    const logs = await mastra.getLogs(transportId);
    return logs;
  } catch (error) {
    return handleError$1(error, "Error getting logs");
  }
}
async function getLogsByRunIdHandler$1({
  mastra,
  runId,
  transportId
}) {
  try {
    validateBody({ runId, transportId });
    const logs = await mastra.getLogsByRunId({ runId, transportId });
    return logs;
  } catch (error) {
    return handleError$1(error, "Error getting logs by run ID");
  }
}
async function getLogTransports$1({ mastra }) {
  try {
    const logger = mastra.getLogger();
    const transports = logger.transports;
    return {
      transports: transports ? Object.keys(transports) : []
    };
  } catch (error) {
    return handleError$1(error, "Error getting log Transports");
  }
}

// src/server/handlers/memory.ts
var memory_exports = {};
__export(memory_exports, {
  createThreadHandler: () => createThreadHandler$1,
  deleteThreadHandler: () => deleteThreadHandler$1,
  getMemoryStatusHandler: () => getMemoryStatusHandler$1,
  getMessagesHandler: () => getMessagesHandler$1,
  getThreadByIdHandler: () => getThreadByIdHandler$1,
  getThreadsHandler: () => getThreadsHandler$1,
  saveMessagesHandler: () => saveMessagesHandler$1,
  updateThreadHandler: () => updateThreadHandler$1
});
function getMemoryFromContext({
  mastra,
  agentId
}) {
  const agent = agentId ? mastra.getAgent(agentId) : null;
  if (agentId && !agent) {
    throw new HTTPException(404, { message: "Agent not found" });
  }
  const memory = agent?.getMemory?.() || mastra.getMemory();
  return memory;
}
async function getMemoryStatusHandler$1({ mastra, agentId }) {
  try {
    const memory = getMemoryFromContext({ mastra, agentId });
    if (!memory) {
      return { result: false };
    }
    return { result: true };
  } catch (error) {
    return handleError$1(error, "Error getting memory status");
  }
}
async function getThreadsHandler$1({
  mastra,
  agentId,
  resourceId
}) {
  try {
    const memory = getMemoryFromContext({ mastra, agentId });
    if (!memory) {
      throw new HTTPException(400, { message: "Memory is not initialized" });
    }
    validateBody({ resourceId });
    const threads = await memory.getThreadsByResourceId({ resourceId });
    return threads;
  } catch (error) {
    return handleError$1(error, "Error getting threads");
  }
}
async function getThreadByIdHandler$1({
  mastra,
  agentId,
  threadId
}) {
  try {
    validateBody({ threadId });
    const memory = getMemoryFromContext({ mastra, agentId });
    if (!memory) {
      throw new HTTPException(400, { message: "Memory is not initialized" });
    }
    const thread = await memory.getThreadById({ threadId });
    if (!thread) {
      throw new HTTPException(404, { message: "Thread not found" });
    }
    return thread;
  } catch (error) {
    return handleError$1(error, "Error getting thread");
  }
}
async function saveMessagesHandler$1({
  mastra,
  agentId,
  body
}) {
  try {
    const memory = getMemoryFromContext({ mastra, agentId });
    if (!memory) {
      throw new HTTPException(400, { message: "Memory is not initialized" });
    }
    if (!body?.messages) {
      throw new HTTPException(400, { message: "Messages are required" });
    }
    if (!Array.isArray(body.messages)) {
      throw new HTTPException(400, { message: "Messages should be an array" });
    }
    const processedMessages = body.messages.map((message) => ({
      ...message,
      id: memory.generateId(),
      createdAt: message.createdAt ? new Date(message.createdAt) : /* @__PURE__ */ new Date()
    }));
    const result = await memory.saveMessages({ messages: processedMessages, memoryConfig: {} });
    return result;
  } catch (error) {
    return handleError$1(error, "Error saving messages");
  }
}
async function createThreadHandler$1({
  mastra,
  agentId,
  body
}) {
  try {
    const memory = getMemoryFromContext({ mastra, agentId });
    if (!memory) {
      throw new HTTPException(400, { message: "Memory is not initialized" });
    }
    validateBody({ resourceId: body?.resourceId });
    const result = await memory.createThread({
      resourceId: body?.resourceId,
      title: body?.title,
      metadata: body?.metadata,
      threadId: body?.threadId
    });
    return result;
  } catch (error) {
    return handleError$1(error, "Error saving thread to memory");
  }
}
async function updateThreadHandler$1({
  mastra,
  agentId,
  threadId,
  body
}) {
  try {
    const memory = getMemoryFromContext({ mastra, agentId });
    if (!body) {
      throw new HTTPException(400, { message: "Body is required" });
    }
    const { title, metadata, resourceId } = body;
    const updatedAt = /* @__PURE__ */ new Date();
    validateBody({ threadId });
    if (!memory) {
      throw new HTTPException(400, { message: "Memory is not initialized" });
    }
    const thread = await memory.getThreadById({ threadId });
    if (!thread) {
      throw new HTTPException(404, { message: "Thread not found" });
    }
    const updatedThread = {
      ...thread,
      title: title || thread.title,
      metadata: metadata || thread.metadata,
      resourceId: resourceId || thread.resourceId,
      createdAt: thread.createdAt,
      updatedAt
    };
    const result = await memory.saveThread({ thread: updatedThread });
    return result;
  } catch (error) {
    return handleError$1(error, "Error updating thread");
  }
}
async function deleteThreadHandler$1({
  mastra,
  agentId,
  threadId
}) {
  try {
    validateBody({ threadId });
    const memory = getMemoryFromContext({ mastra, agentId });
    if (!memory) {
      throw new HTTPException(400, { message: "Memory is not initialized" });
    }
    const thread = await memory.getThreadById({ threadId });
    if (!thread) {
      throw new HTTPException(404, { message: "Thread not found" });
    }
    await memory.deleteThread(threadId);
    return { result: "Thread deleted" };
  } catch (error) {
    return handleError$1(error, "Error deleting thread");
  }
}
async function getMessagesHandler$1({
  mastra,
  agentId,
  threadId,
  limit
}) {
  if (limit !== void 0 && (!Number.isInteger(limit) || limit <= 0)) {
    throw new HTTPException(400, { message: "Invalid limit: must be a positive integer" });
  }
  try {
    validateBody({ threadId });
    const memory = getMemoryFromContext({ mastra, agentId });
    if (!memory) {
      throw new HTTPException(400, { message: "Memory is not initialized" });
    }
    const thread = await memory.getThreadById({ threadId });
    if (!thread) {
      throw new HTTPException(404, { message: "Thread not found" });
    }
    const result = await memory.query({
      threadId,
      ...limit && { selectBy: { last: limit } }
    });
    return result;
  } catch (error) {
    return handleError$1(error, "Error getting messages");
  }
}

// src/server/handlers/network.ts
var network_exports = {};
__export(network_exports, {
  generateHandler: () => generateHandler$1,
  getNetworkByIdHandler: () => getNetworkByIdHandler$1,
  getNetworksHandler: () => getNetworksHandler$1,
  streamGenerateHandler: () => streamGenerateHandler$1
});
async function getNetworksHandler$1({
  mastra,
  runtimeContext
}) {
  try {
    const networks = mastra.getNetworks();
    const serializedNetworks = await Promise.all(
      networks.map(async (network) => {
        const routingAgent = network.getRoutingAgent();
        const routingLLM = await routingAgent.getLLM({ runtimeContext });
        const agents = network.getAgents();
        return {
          id: network.formatAgentId(routingAgent.name),
          name: routingAgent.name,
          instructions: routingAgent.instructions,
          agents: await Promise.all(
            agents.map(async (agent) => {
              const llm = await agent.getLLM({ runtimeContext });
              return {
                name: agent.name,
                provider: llm?.getProvider(),
                modelId: llm?.getModelId()
              };
            })
          ),
          routingModel: {
            provider: routingLLM?.getProvider(),
            modelId: routingLLM?.getModelId()
          }
        };
      })
    );
    return serializedNetworks;
  } catch (error) {
    return handleError$1(error, "Error getting networks");
  }
}
async function getNetworkByIdHandler$1({
  mastra,
  networkId,
  runtimeContext
}) {
  try {
    const networks = mastra.getNetworks();
    const network = networks.find((network2) => {
      const routingAgent2 = network2.getRoutingAgent();
      return network2.formatAgentId(routingAgent2.name) === networkId;
    });
    if (!network) {
      throw new HTTPException(404, { message: "Network not found" });
    }
    const routingAgent = network.getRoutingAgent();
    const routingLLM = await routingAgent.getLLM({ runtimeContext });
    const agents = network.getAgents();
    const serializedNetwork = {
      id: network.formatAgentId(routingAgent.name),
      name: routingAgent.name,
      instructions: routingAgent.instructions,
      agents: await Promise.all(
        agents.map(async (agent) => {
          const llm = await agent.getLLM({ runtimeContext });
          return {
            name: agent.name,
            provider: llm?.getProvider(),
            modelId: llm?.getModelId()
          };
        })
      ),
      routingModel: {
        provider: routingLLM?.getProvider(),
        modelId: routingLLM?.getModelId()
      }
    };
    return serializedNetwork;
  } catch (error) {
    return handleError$1(error, "Error getting network by ID");
  }
}
async function generateHandler$1({
  mastra,
  runtimeContext,
  networkId,
  body
}) {
  try {
    const network = mastra.getNetwork(networkId);
    if (!network) {
      throw new HTTPException(404, { message: "Network not found" });
    }
    validateBody({ messages: body.messages });
    const { messages, ...rest } = body;
    const result = await network.generate(messages, { ...rest, runtimeContext });
    return result;
  } catch (error) {
    return handleError$1(error, "Error generating from network");
  }
}
async function streamGenerateHandler$1({
  mastra,
  networkId,
  body,
  runtimeContext
}) {
  try {
    const network = mastra.getNetwork(networkId);
    if (!network) {
      throw new HTTPException(404, { message: "Network not found" });
    }
    validateBody({ messages: body.messages });
    const { messages, output, ...rest } = body;
    const streamResult = await network.stream(messages, {
      output,
      ...rest,
      runtimeContext
    });
    const streamResponse = output ? streamResult.toTextStreamResponse() : streamResult.toDataStreamResponse({
      sendUsage: true,
      sendReasoning: true,
      getErrorMessage: (error) => {
        return `An error occurred while processing your request. ${error instanceof Error ? error.message : JSON.stringify(error)}`;
      }
    });
    return streamResponse;
  } catch (error) {
    return handleError$1(error, "Error streaming from network");
  }
}

// src/server/handlers/telemetry.ts
var telemetry_exports = {};
__export(telemetry_exports, {
  getTelemetryHandler: () => getTelemetryHandler$1,
  storeTelemetryHandler: () => storeTelemetryHandler$1
});
async function getTelemetryHandler$1({ mastra, body }) {
  try {
    const telemetry = mastra.getTelemetry();
    const storage = mastra.getStorage();
    if (!telemetry) {
      throw new HTTPException(400, { message: "Telemetry is not initialized" });
    }
    if (!storage) {
      throw new HTTPException(400, { message: "Storage is not initialized" });
    }
    if (!body) {
      throw new HTTPException(400, { message: "Body is required" });
    }
    const { name, scope, page, perPage, attribute, fromDate, toDate } = body;
    const attributes = attribute ? Object.fromEntries(
      (Array.isArray(attribute) ? attribute : [attribute]).map((attr) => {
        const [key, value] = attr.split(":");
        return [key, value];
      })
    ) : void 0;
    const traces = await storage.getTraces({
      name,
      scope,
      page: Number(page ?? 0),
      perPage: Number(perPage ?? 100),
      attributes,
      fromDate: fromDate ? new Date(fromDate) : void 0,
      toDate: toDate ? new Date(toDate) : void 0
    });
    return traces;
  } catch (error2) {
    return handleError$1(error2, "Error getting telemetry");
  }
}
async function storeTelemetryHandler$1({ mastra, body }) {
  try {
    const storage = mastra.getStorage();
    const logger = mastra.getLogger();
    if (!storage) {
      throw new HTTPException(400, { message: "Storage is not initialized" });
    }
    const now = /* @__PURE__ */ new Date();
    const items = body?.resourceSpans?.[0]?.scopeSpans;
    logger.debug("[Telemetry Handler] Received spans:", {
      totalSpans: items?.reduce((acc, scope) => acc + scope.spans.length, 0) || 0,
      timestamp: now.toISOString()
    });
    if (!items?.length) {
      return {
        status: "success",
        message: "No spans to process",
        traceCount: 0
      };
    }
    const allSpans = items.reduce((acc, scopedSpans) => {
      const { scope, spans } = scopedSpans;
      for (const span of spans) {
        const {
          spanId,
          parentSpanId,
          traceId,
          name,
          kind,
          attributes,
          status,
          events,
          links,
          startTimeUnixNano,
          endTimeUnixNano,
          ...rest
        } = span;
        const startTime = Number(BigInt(startTimeUnixNano) / 1000n);
        const endTime = Number(BigInt(endTimeUnixNano) / 1000n);
        acc.push({
          id: spanId,
          parentSpanId,
          traceId,
          name,
          scope: scope.name,
          kind,
          status: JSON.stringify(status),
          events: JSON.stringify(events),
          links: JSON.stringify(links),
          attributes: JSON.stringify(
            attributes.reduce((acc2, attr) => {
              const valueKey = Object.keys(attr.value)[0];
              if (valueKey) {
                acc2[attr.key] = attr.value[valueKey];
              }
              return acc2;
            }, {})
          ),
          startTime,
          endTime,
          other: JSON.stringify(rest),
          createdAt: now
        });
      }
      return acc;
    }, []);
    return storage.batchTraceInsert({
      records: allSpans
    }).then(() => {
      return {
        status: "success",
        message: "Traces received and processed successfully",
        traceCount: body.resourceSpans?.length || 0
      };
    }).catch(() => {
      return {
        status: "error",
        message: "Failed to process traces",
        // @ts-ignore
        error: error.message
      };
    });
  } catch (error2) {
    console.error("Error processing traces:", error2);
    return {
      status: "error",
      message: "Failed to process traces",
      // @ts-ignore
      error: error2.message
    };
  }
}

// src/server/handlers/tools.ts
var tools_exports = {};
__export(tools_exports, {
  executeAgentToolHandler: () => executeAgentToolHandler$1,
  executeToolHandler: () => executeToolHandler$1,
  getToolByIdHandler: () => getToolByIdHandler$1,
  getToolsHandler: () => getToolsHandler$1
});
async function getToolsHandler$1({ tools }) {
  try {
    if (!tools) {
      return {};
    }
    const serializedTools = Object.entries(tools).reduce(
      (acc, [id, _tool]) => {
        const tool = _tool;
        acc[id] = {
          ...tool,
          inputSchema: tool.inputSchema ? stringify(esm_default(tool.inputSchema)) : void 0,
          outputSchema: tool.outputSchema ? stringify(esm_default(tool.outputSchema)) : void 0
        };
        return acc;
      },
      {}
    );
    return serializedTools;
  } catch (error) {
    return handleError$1(error, "Error getting tools");
  }
}
async function getToolByIdHandler$1({ tools, toolId }) {
  try {
    const tool = Object.values(tools || {}).find((tool2) => tool2.id === toolId);
    if (!tool) {
      throw new HTTPException(404, { message: "Tool not found" });
    }
    const serializedTool = {
      ...tool,
      inputSchema: tool.inputSchema ? stringify(esm_default(tool.inputSchema)) : void 0,
      outputSchema: tool.outputSchema ? stringify(esm_default(tool.outputSchema)) : void 0
    };
    return serializedTool;
  } catch (error) {
    return handleError$1(error, "Error getting tool");
  }
}
function executeToolHandler$1(tools) {
  return async ({
    mastra,
    runId,
    toolId,
    data,
    runtimeContext,
    runtimeContextFromRequest
  }) => {
    try {
      if (!toolId) {
        throw new HTTPException(400, { message: "Tool ID is required" });
      }
      const tool = Object.values(tools || {}).find((tool2) => tool2.id === toolId);
      if (!tool) {
        throw new HTTPException(404, { message: "Tool not found" });
      }
      if (!tool?.execute) {
        throw new HTTPException(400, { message: "Tool is not executable" });
      }
      validateBody({ data });
      if (isVercelTool(tool)) {
        const result2 = await tool.execute(data);
        return result2;
      }
      const finalRuntimeContext = new RuntimeContext([
        ...Array.from(runtimeContext.entries()),
        ...Array.from(Object.entries(runtimeContextFromRequest ?? {}))
      ]);
      const result = await tool.execute({
        context: data,
        mastra,
        runId,
        runtimeContext: finalRuntimeContext
      });
      return result;
    } catch (error) {
      return handleError$1(error, "Error executing tool");
    }
  };
}
async function executeAgentToolHandler$1({
  mastra,
  agentId,
  toolId,
  data,
  runtimeContext,
  runtimeContextFromRequest
}) {
  try {
    const agent = agentId ? mastra.getAgent(agentId) : null;
    if (!agent) {
      throw new HTTPException(404, { message: "Tool not found" });
    }
    const tool = Object.values(agent?.tools || {}).find((tool2) => tool2.id === toolId);
    if (!tool) {
      throw new HTTPException(404, { message: "Tool not found" });
    }
    if (!tool?.execute) {
      throw new HTTPException(400, { message: "Tool is not executable" });
    }
    const finalRuntimeContext = new RuntimeContext([
      ...Array.from(runtimeContext.entries()),
      ...Array.from(Object.entries(runtimeContextFromRequest ?? {}))
    ]);
    const result = await tool.execute({
      context: data,
      runtimeContext: finalRuntimeContext,
      mastra,
      runId: agentId
    });
    return result;
  } catch (error) {
    return handleError$1(error, "Error executing tool");
  }
}

// src/server/handlers/vector.ts
var vector_exports = {};
__export(vector_exports, {
  createIndex: () => createIndex$1,
  deleteIndex: () => deleteIndex$1,
  describeIndex: () => describeIndex$1,
  listIndexes: () => listIndexes$1,
  queryVectors: () => queryVectors$1,
  upsertVectors: () => upsertVectors$1
});
function getVector(mastra, vectorName) {
  if (!vectorName) {
    throw new HTTPException(400, { message: "Vector name is required" });
  }
  const vector = mastra.getVector(vectorName);
  if (!vector) {
    throw new HTTPException(404, { message: `Vector store ${vectorName} not found` });
  }
  return vector;
}
async function upsertVectors$1({ mastra, vectorName, index }) {
  try {
    if (!index?.indexName || !index?.vectors || !Array.isArray(index.vectors)) {
      throw new HTTPException(400, { message: "Invalid request index. indexName and vectors array are required." });
    }
    const vector = getVector(mastra, vectorName);
    const result = await vector.upsert(index);
    return { ids: result };
  } catch (error) {
    return handleError$1(error, "Error upserting vectors");
  }
}
async function createIndex$1({
  mastra,
  vectorName,
  index
}) {
  try {
    const { indexName, dimension, metric } = index;
    if (!indexName || typeof dimension !== "number" || dimension <= 0) {
      throw new HTTPException(400, {
        message: "Invalid request index, indexName and positive dimension number are required."
      });
    }
    if (metric && !["cosine", "euclidean", "dotproduct"].includes(metric)) {
      throw new HTTPException(400, { message: "Invalid metric. Must be one of: cosine, euclidean, dotproduct" });
    }
    const vector = getVector(mastra, vectorName);
    await vector.createIndex({ indexName, dimension, metric });
    return { success: true };
  } catch (error) {
    return handleError$1(error, "Error creating index");
  }
}
async function queryVectors$1({
  mastra,
  vectorName,
  query
}) {
  try {
    if (!query?.indexName || !query?.queryVector || !Array.isArray(query.queryVector)) {
      throw new HTTPException(400, { message: "Invalid request query. indexName and queryVector array are required." });
    }
    const vector = getVector(mastra, vectorName);
    const results = await vector.query(query);
    return results;
  } catch (error) {
    return handleError$1(error, "Error querying vectors");
  }
}
async function listIndexes$1({ mastra, vectorName }) {
  try {
    const vector = getVector(mastra, vectorName);
    const indexes = await vector.listIndexes();
    return indexes.filter(Boolean);
  } catch (error) {
    return handleError$1(error, "Error listing indexes");
  }
}
async function describeIndex$1({
  mastra,
  vectorName,
  indexName
}) {
  try {
    if (!indexName) {
      throw new HTTPException(400, { message: "Index name is required" });
    }
    const vector = getVector(mastra, vectorName);
    const stats = await vector.describeIndex(indexName);
    return {
      dimension: stats.dimension,
      count: stats.count,
      metric: stats.metric?.toLowerCase()
    };
  } catch (error) {
    return handleError$1(error, "Error describing index");
  }
}
async function deleteIndex$1({
  mastra,
  vectorName,
  indexName
}) {
  try {
    if (!indexName) {
      throw new HTTPException(400, { message: "Index name is required" });
    }
    const vector = getVector(mastra, vectorName);
    await vector.deleteIndex(indexName);
    return { success: true };
  } catch (error) {
    return handleError$1(error, "Error deleting index");
  }
}

// src/server/handlers/vNextWorkflows.ts
var vNextWorkflows_exports = {};
__export(vNextWorkflows_exports, {
  createVNextWorkflowRunHandler: () => createVNextWorkflowRunHandler$1,
  getVNextWorkflowByIdHandler: () => getVNextWorkflowByIdHandler$1,
  getVNextWorkflowRunByIdHandler: () => getVNextWorkflowRunByIdHandler,
  getVNextWorkflowRunsHandler: () => getVNextWorkflowRunsHandler$1,
  getVNextWorkflowsHandler: () => getVNextWorkflowsHandler$1,
  resumeAsyncVNextWorkflowHandler: () => resumeAsyncVNextWorkflowHandler$1,
  resumeVNextWorkflowHandler: () => resumeVNextWorkflowHandler$1,
  startAsyncVNextWorkflowHandler: () => startAsyncVNextWorkflowHandler$1,
  startVNextWorkflowRunHandler: () => startVNextWorkflowRunHandler$1,
  watchVNextWorkflowHandler: () => watchVNextWorkflowHandler$1
});
async function getVNextWorkflowsHandler$1({ mastra }) {
  try {
    const workflows = mastra.vnext_getWorkflows({ serialized: false });
    const _workflows = Object.entries(workflows).reduce((acc, [key, workflow]) => {
      acc[key] = {
        name: workflow.name,
        steps: Object.entries(workflow.steps).reduce((acc2, [key2, step]) => {
          acc2[key2] = {
            id: step.id,
            description: step.description,
            inputSchema: step.inputSchema ? stringify(esm_default(step.inputSchema)) : void 0,
            outputSchema: step.outputSchema ? stringify(esm_default(step.outputSchema)) : void 0,
            resumeSchema: step.resumeSchema ? stringify(esm_default(step.resumeSchema)) : void 0,
            suspendSchema: step.suspendSchema ? stringify(esm_default(step.suspendSchema)) : void 0
          };
          return acc2;
        }, {}),
        stepGraph: workflow.serializedStepGraph,
        inputSchema: workflow.inputSchema ? stringify(esm_default(workflow.inputSchema)) : void 0,
        outputSchema: workflow.outputSchema ? stringify(esm_default(workflow.outputSchema)) : void 0
      };
      return acc;
    }, {});
    return _workflows;
  } catch (error) {
    throw new HTTPException(500, { message: error?.message || "Error getting workflows" });
  }
}
async function getVNextWorkflowByIdHandler$1({ mastra, workflowId }) {
  try {
    if (!workflowId) {
      throw new HTTPException(400, { message: "Workflow ID is required" });
    }
    const workflow = mastra.vnext_getWorkflow(workflowId);
    if (!workflow) {
      throw new HTTPException(404, { message: "Workflow not found" });
    }
    return {
      steps: Object.entries(workflow.steps).reduce((acc, [key, step]) => {
        acc[key] = {
          id: step.id,
          description: step.description,
          inputSchema: step.inputSchema ? stringify(esm_default(step.inputSchema)) : void 0,
          outputSchema: step.outputSchema ? stringify(esm_default(step.outputSchema)) : void 0,
          resumeSchema: step.resumeSchema ? stringify(esm_default(step.resumeSchema)) : void 0,
          suspendSchema: step.suspendSchema ? stringify(esm_default(step.suspendSchema)) : void 0
        };
        return acc;
      }, {}),
      name: workflow.name,
      stepGraph: workflow.serializedStepGraph,
      inputSchema: workflow.inputSchema ? stringify(esm_default(workflow.inputSchema)) : void 0,
      outputSchema: workflow.outputSchema ? stringify(esm_default(workflow.outputSchema)) : void 0
    };
  } catch (error) {
    throw new HTTPException(500, { message: error?.message || "Error getting workflow" });
  }
}
async function getVNextWorkflowRunByIdHandler({
  mastra,
  workflowId,
  runId
}) {
  try {
    if (!workflowId) {
      throw new HTTPException(400, { message: "Workflow ID is required" });
    }
    if (!runId) {
      throw new HTTPException(400, { message: "Run ID is required" });
    }
    const workflow = mastra.vnext_getWorkflow(workflowId);
    if (!workflow) {
      throw new HTTPException(404, { message: "Workflow not found" });
    }
    const run = await workflow.getWorkflowRunById(runId);
    if (!run) {
      throw new HTTPException(404, { message: "Workflow run not found" });
    }
    return run;
  } catch (error) {
    throw new HTTPException(500, { message: error?.message || "Error getting workflow run" });
  }
}
async function createVNextWorkflowRunHandler$1({
  mastra,
  workflowId,
  runId: prevRunId
}) {
  try {
    if (!workflowId) {
      throw new HTTPException(400, { message: "Workflow ID is required" });
    }
    const workflow = mastra.vnext_getWorkflow(workflowId);
    if (!workflow) {
      throw new HTTPException(404, { message: "Workflow not found" });
    }
    const run = workflow.createRun({ runId: prevRunId });
    return { runId: run.runId };
  } catch (error) {
    throw new HTTPException(500, { message: error?.message || "Error creating workflow run" });
  }
}
async function startAsyncVNextWorkflowHandler$1({
  mastra,
  runtimeContext,
  workflowId,
  runId,
  inputData,
  runtimeContextFromRequest
}) {
  try {
    if (!workflowId) {
      throw new HTTPException(400, { message: "Workflow ID is required" });
    }
    const workflow = mastra.vnext_getWorkflow(workflowId);
    if (!workflow) {
      throw new HTTPException(404, { message: "Workflow not found" });
    }
    const finalRuntimeContext = new RuntimeContext([
      ...Array.from(runtimeContext?.entries() ?? []),
      ...Array.from(Object.entries(runtimeContextFromRequest ?? {}))
    ]);
    const _run = workflow.createRun({ runId });
    const result = await _run.start({
      inputData,
      runtimeContext: finalRuntimeContext
    });
    return result;
  } catch (error) {
    throw new HTTPException(500, { message: error?.message || "Error executing workflow" });
  }
}
async function startVNextWorkflowRunHandler$1({
  mastra,
  runtimeContext,
  workflowId,
  runId,
  inputData,
  runtimeContextFromRequest
}) {
  try {
    if (!workflowId) {
      throw new HTTPException(400, { message: "Workflow ID is required" });
    }
    if (!runId) {
      throw new HTTPException(400, { message: "runId required to start run" });
    }
    const workflow = mastra.vnext_getWorkflow(workflowId);
    const run = await workflow.getWorkflowRunById(runId);
    if (!run) {
      throw new HTTPException(404, { message: "Workflow run not found" });
    }
    const finalRuntimeContext = new RuntimeContext([
      ...Array.from(runtimeContext?.entries() ?? []),
      ...Array.from(Object.entries(runtimeContextFromRequest ?? {}))
    ]);
    const _run = workflow.createRun({ runId });
    void _run.start({
      inputData,
      runtimeContext: finalRuntimeContext
    });
    return { message: "Workflow run started" };
  } catch (e) {
    return handleError$1(e, "Error starting workflow run");
  }
}
async function watchVNextWorkflowHandler$1({
  mastra,
  workflowId,
  runId
}) {
  try {
    if (!workflowId) {
      throw new HTTPException(400, { message: "Workflow ID is required" });
    }
    if (!runId) {
      throw new HTTPException(400, { message: "runId required to watch workflow" });
    }
    const workflow = mastra.vnext_getWorkflow(workflowId);
    const run = await workflow.getWorkflowRunById(runId);
    if (!run) {
      throw new HTTPException(404, { message: "Workflow run not found" });
    }
    const _run = workflow.createRun({ runId });
    let unwatch;
    let asyncRef = null;
    const stream = new ReadableStream$1({
      start(controller) {
        unwatch = _run.watch(({ type, payload, eventTimestamp }) => {
          controller.enqueue(JSON.stringify({ type, payload, eventTimestamp, runId }));
          if (asyncRef) {
            clearImmediate(asyncRef);
            asyncRef = null;
          }
          asyncRef = setImmediate(async () => {
            const runDone = payload.workflowState.status !== "running";
            if (runDone) {
              controller.close();
              unwatch?.();
            }
          });
        });
      },
      cancel() {
        unwatch?.();
      }
    });
    return stream;
  } catch (error) {
    return handleError$1(error, "Error watching workflow");
  }
}
async function resumeAsyncVNextWorkflowHandler$1({
  mastra,
  workflowId,
  runId,
  body,
  runtimeContext,
  runtimeContextFromRequest
}) {
  try {
    if (!workflowId) {
      throw new HTTPException(400, { message: "Workflow ID is required" });
    }
    if (!runId) {
      throw new HTTPException(400, { message: "runId required to resume workflow" });
    }
    if (!body.step) {
      throw new HTTPException(400, { message: "step required to resume workflow" });
    }
    const workflow = mastra.vnext_getWorkflow(workflowId);
    const run = await workflow.getWorkflowRunById(runId);
    if (!run) {
      throw new HTTPException(404, { message: "Workflow run not found" });
    }
    const finalRuntimeContext = new RuntimeContext([
      ...Array.from(runtimeContext?.entries() ?? []),
      ...Array.from(Object.entries(runtimeContextFromRequest ?? {}))
    ]);
    const _run = workflow.createRun({ runId });
    const result = await _run.resume({
      step: body.step,
      resumeData: body.resumeData,
      runtimeContext: finalRuntimeContext
    });
    return result;
  } catch (error) {
    return handleError$1(error, "Error resuming workflow step");
  }
}
async function resumeVNextWorkflowHandler$1({
  mastra,
  workflowId,
  runId,
  body,
  runtimeContext
}) {
  try {
    if (!workflowId) {
      throw new HTTPException(400, { message: "Workflow ID is required" });
    }
    if (!runId) {
      throw new HTTPException(400, { message: "runId required to resume workflow" });
    }
    if (!body.step) {
      throw new HTTPException(400, { message: "step required to resume workflow" });
    }
    const workflow = mastra.vnext_getWorkflow(workflowId);
    const run = await workflow.getWorkflowRunById(runId);
    if (!run) {
      throw new HTTPException(404, { message: "Workflow run not found" });
    }
    const _run = workflow.createRun({ runId });
    void _run.resume({
      step: body.step,
      resumeData: body.resumeData,
      runtimeContext
    });
    return { message: "Workflow run resumed" };
  } catch (error) {
    return handleError$1(error, "Error resuming workflow");
  }
}
async function getVNextWorkflowRunsHandler$1({
  mastra,
  workflowId,
  fromDate,
  toDate,
  limit,
  offset,
  resourceId
}) {
  try {
    if (!workflowId) {
      throw new HTTPException(400, { message: "Workflow ID is required" });
    }
    const workflow = mastra.vnext_getWorkflow(workflowId);
    const workflowRuns = await workflow.getWorkflowRuns({ fromDate, toDate, limit, offset, resourceId }) || {
      runs: [],
      total: 0
    };
    return workflowRuns;
  } catch (error) {
    return handleError$1(error, "Error getting workflow runs");
  }
}

// src/server/handlers/voice.ts
var voice_exports = {};
__export(voice_exports, {
  generateSpeechHandler: () => generateSpeechHandler,
  getSpeakersHandler: () => getSpeakersHandler$1,
  transcribeSpeechHandler: () => transcribeSpeechHandler
});
async function getSpeakersHandler$1({ mastra, agentId }) {
  try {
    if (!agentId) {
      throw new HTTPException(400, { message: "Agent ID is required" });
    }
    const agent = mastra.getAgent(agentId);
    if (!agent) {
      throw new HTTPException(404, { message: "Agent not found" });
    }
    if (!agent.voice) {
      throw new HTTPException(400, { message: "Agent does not have voice capabilities" });
    }
    const speakers = await agent.voice.getSpeakers();
    return speakers;
  } catch (error) {
    return handleError$1(error, "Error getting speakers");
  }
}
async function generateSpeechHandler({
  mastra,
  agentId,
  body
}) {
  try {
    if (!agentId) {
      throw new HTTPException(400, { message: "Agent ID is required" });
    }
    validateBody({
      text: body?.text
    });
    const agent = mastra.getAgent(agentId);
    if (!agent) {
      throw new HTTPException(404, { message: "Agent not found" });
    }
    if (!agent.voice) {
      throw new HTTPException(400, { message: "Agent does not have voice capabilities" });
    }
    const audioStream = await agent.voice.speak(body.text, { speaker: body.speakerId });
    if (!audioStream) {
      throw new HTTPException(500, { message: "Failed to generate speech" });
    }
    return audioStream;
  } catch (error) {
    return handleError$1(error, "Error generating speech");
  }
}
async function transcribeSpeechHandler({
  mastra,
  agentId,
  body
}) {
  try {
    if (!agentId) {
      throw new HTTPException(400, { message: "Agent ID is required" });
    }
    if (!body?.audioData) {
      throw new HTTPException(400, { message: "Audio data is required" });
    }
    const agent = mastra.getAgent(agentId);
    if (!agent) {
      throw new HTTPException(404, { message: "Agent not found" });
    }
    if (!agent.voice) {
      throw new HTTPException(400, { message: "Agent does not have voice capabilities" });
    }
    const audioStream = new Readable();
    audioStream.push(body.audioData);
    audioStream.push(null);
    const text = await agent.voice.listen(audioStream, body.options);
    return { text };
  } catch (error) {
    return handleError$1(error, "Error transcribing speech");
  }
}

// src/server/handlers/workflows.ts
var workflows_exports = {};
__export(workflows_exports, {
  createRunHandler: () => createRunHandler$1,
  getWorkflowByIdHandler: () => getWorkflowByIdHandler$1,
  getWorkflowRunHandler: () => getWorkflowRunHandler,
  getWorkflowRunsHandler: () => getWorkflowRunsHandler$1,
  getWorkflowsHandler: () => getWorkflowsHandler$1,
  resumeAsyncWorkflowHandler: () => resumeAsyncWorkflowHandler$1,
  resumeWorkflowHandler: () => resumeWorkflowHandler$1,
  startAsyncWorkflowHandler: () => startAsyncWorkflowHandler$1,
  startWorkflowRunHandler: () => startWorkflowRunHandler$1,
  watchWorkflowHandler: () => watchWorkflowHandler$1
});
async function getWorkflowsHandler$1({ mastra }) {
  try {
    const workflows = mastra.getWorkflows({ serialized: false });
    const _workflows = Object.entries(workflows).reduce((acc, [key, workflow]) => {
      if (workflow.isNested) return acc;
      acc[key] = {
        stepGraph: workflow.stepGraph,
        stepSubscriberGraph: workflow.stepSubscriberGraph,
        serializedStepGraph: workflow.serializedStepGraph,
        serializedStepSubscriberGraph: workflow.serializedStepSubscriberGraph,
        name: workflow.name,
        triggerSchema: workflow.triggerSchema ? stringify(esm_default(workflow.triggerSchema)) : void 0,
        steps: Object.entries(workflow.steps).reduce((acc2, [key2, step]) => {
          const _step = step;
          acc2[key2] = {
            id: _step.id,
            description: _step.description,
            workflowId: _step.workflowId,
            inputSchema: _step.inputSchema ? stringify(esm_default(_step.inputSchema)) : void 0,
            outputSchema: _step.outputSchema ? stringify(esm_default(_step.outputSchema)) : void 0
          };
          return acc2;
        }, {})
      };
      return acc;
    }, {});
    return _workflows;
  } catch (error) {
    throw new HTTPException(500, { message: error?.message || "Error getting workflows" });
  }
}
async function getWorkflowByIdHandler$1({ mastra, workflowId }) {
  try {
    if (!workflowId) {
      throw new HTTPException(400, { message: "Workflow ID is required" });
    }
    const workflow = mastra.getWorkflow(workflowId);
    if (!workflow) {
      throw new HTTPException(404, { message: "Workflow not found" });
    }
    return {
      stepGraph: workflow.stepGraph,
      stepSubscriberGraph: workflow.stepSubscriberGraph,
      serializedStepGraph: workflow.serializedStepGraph,
      serializedStepSubscriberGraph: workflow.serializedStepSubscriberGraph,
      name: workflow.name,
      triggerSchema: workflow.triggerSchema ? stringify(esm_default(workflow.triggerSchema)) : void 0,
      steps: Object.entries(workflow.steps).reduce((acc, [key, step]) => {
        const _step = step;
        acc[key] = {
          id: _step.id,
          description: _step.description,
          workflowId: _step.workflowId,
          inputSchema: _step.inputSchema ? stringify(esm_default(_step.inputSchema)) : void 0,
          outputSchema: _step.outputSchema ? stringify(esm_default(_step.outputSchema)) : void 0
        };
        return acc;
      }, {})
    };
  } catch (error) {
    throw new HTTPException(500, { message: error?.message || "Error getting workflow" });
  }
}
async function startAsyncWorkflowHandler$1({
  mastra,
  runtimeContext,
  workflowId,
  runId,
  triggerData
}) {
  try {
    if (!workflowId) {
      throw new HTTPException(400, { message: "Workflow ID is required" });
    }
    const workflow = mastra.getWorkflow(workflowId);
    if (!workflow) {
      throw new HTTPException(404, { message: "Workflow not found" });
    }
    if (!runId) {
      const newRun = workflow.createRun();
      const result2 = await newRun.start({
        triggerData,
        runtimeContext
      });
      return result2;
    }
    const run = workflow.getMemoryRun(runId);
    if (!run) {
      throw new HTTPException(404, { message: "Workflow run not found" });
    }
    const result = await run.start({
      triggerData,
      runtimeContext
    });
    return result;
  } catch (error) {
    throw new HTTPException(500, { message: error?.message || "Error executing workflow" });
  }
}
async function getWorkflowRunHandler({
  mastra,
  workflowId,
  runId
}) {
  try {
    if (!workflowId) {
      throw new HTTPException(400, { message: "Workflow ID is required" });
    }
    if (!runId) {
      throw new HTTPException(400, { message: "Run ID is required" });
    }
    const workflow = mastra.getWorkflow(workflowId);
    if (!workflow) {
      throw new HTTPException(404, { message: "Workflow not found" });
    }
    const run = await workflow.getRun(runId);
    if (!run) {
      throw new HTTPException(404, { message: "Workflow run not found" });
    }
    return run;
  } catch (error) {
    throw new HTTPException(500, { message: error?.message || "Error getting workflow run" });
  }
}
async function createRunHandler$1({
  mastra,
  workflowId,
  runId: prevRunId
}) {
  try {
    if (!workflowId) {
      throw new HTTPException(400, { message: "Workflow ID is required" });
    }
    const workflow = mastra.getWorkflow(workflowId);
    if (!workflow) {
      throw new HTTPException(404, { message: "Workflow not found" });
    }
    const newRun = workflow.createRun({ runId: prevRunId });
    return { runId: newRun.runId };
  } catch (error) {
    throw new HTTPException(500, { message: error?.message || "Error creating workflow run" });
  }
}
async function startWorkflowRunHandler$1({
  mastra,
  runtimeContext,
  workflowId,
  runId,
  triggerData
}) {
  try {
    if (!workflowId) {
      throw new HTTPException(400, { message: "Workflow ID is required" });
    }
    if (!runId) {
      throw new HTTPException(400, { message: "runId required to start run" });
    }
    const workflow = mastra.getWorkflow(workflowId);
    const run = workflow.getMemoryRun(runId);
    if (!run) {
      throw new HTTPException(404, { message: "Workflow run not found" });
    }
    void run.start({
      triggerData,
      runtimeContext
    });
    return { message: "Workflow run started" };
  } catch (e) {
    return handleError$1(e, "Error starting workflow run");
  }
}
async function watchWorkflowHandler$1({
  mastra,
  workflowId,
  runId
}) {
  try {
    if (!workflowId) {
      throw new HTTPException(400, { message: "Workflow ID is required" });
    }
    if (!runId) {
      throw new HTTPException(400, { message: "runId required to watch workflow" });
    }
    const workflow = mastra.getWorkflow(workflowId);
    const run = workflow.getMemoryRun(runId);
    if (!run) {
      throw new HTTPException(404, { message: "Workflow run not found" });
    }
    let unwatch;
    let asyncRef = null;
    const stream = new ReadableStream$1({
      start(controller) {
        unwatch = run.watch(({ activePaths, runId: runId2, timestamp, results }) => {
          const activePathsObj = Object.fromEntries(activePaths);
          controller.enqueue(JSON.stringify({ activePaths: activePathsObj, runId: runId2, timestamp, results }));
          if (asyncRef) {
            clearImmediate(asyncRef);
            asyncRef = null;
          }
          asyncRef = setImmediate(() => {
            const runDone = Object.values(activePathsObj).every((value) => value.status !== "executing");
            if (runDone) {
              controller.close();
              unwatch?.();
            }
          });
        });
      },
      cancel() {
        unwatch?.();
      }
    });
    return stream;
  } catch (error) {
    return handleError$1(error, "Error watching workflow");
  }
}
async function resumeAsyncWorkflowHandler$1({
  mastra,
  workflowId,
  runId,
  body,
  runtimeContext
}) {
  try {
    if (!workflowId) {
      throw new HTTPException(400, { message: "Workflow ID is required" });
    }
    if (!runId) {
      throw new HTTPException(400, { message: "runId required to resume workflow" });
    }
    const workflow = mastra.getWorkflow(workflowId);
    const run = workflow.getMemoryRun(runId);
    if (!run) {
      throw new HTTPException(404, { message: "Workflow run not found" });
    }
    const result = await run.resume({
      stepId: body.stepId,
      context: body.context,
      runtimeContext
    });
    return result;
  } catch (error) {
    return handleError$1(error, "Error resuming workflow step");
  }
}
async function resumeWorkflowHandler$1({
  mastra,
  workflowId,
  runId,
  body,
  runtimeContext
}) {
  try {
    if (!workflowId) {
      throw new HTTPException(400, { message: "Workflow ID is required" });
    }
    if (!runId) {
      throw new HTTPException(400, { message: "runId required to resume workflow" });
    }
    const workflow = mastra.getWorkflow(workflowId);
    const run = workflow.getMemoryRun(runId);
    if (!run) {
      throw new HTTPException(404, { message: "Workflow run not found" });
    }
    void run.resume({
      stepId: body.stepId,
      context: body.context,
      runtimeContext
    });
    return { message: "Workflow run resumed" };
  } catch (error) {
    return handleError$1(error, "Error resuming workflow");
  }
}
async function getWorkflowRunsHandler$1({
  mastra,
  workflowId,
  fromDate,
  toDate,
  limit,
  offset,
  resourceId
}) {
  try {
    if (!workflowId) {
      throw new HTTPException(400, { message: "Workflow ID is required" });
    }
    const workflow = mastra.getWorkflow(workflowId);
    const workflowRuns = await workflow.getWorkflowRuns({ fromDate, toDate, limit, offset, resourceId }) || {
      runs: [],
      total: 0
    };
    return workflowRuns;
  } catch (error) {
    return handleError$1(error, "Error getting workflow runs");
  }
}

var GlobalRequest = global.Request;
var Request = class extends GlobalRequest {
  constructor(input, options) {
    if (typeof input === "object" && getRequestCache in input) {
      input = input[getRequestCache]();
    }
    if (typeof options?.body?.getReader !== "undefined") {
      options.duplex ??= "half";
    }
    super(input, options);
  }
};
var newRequestFromIncoming = (method, url, incoming, abortController) => {
  const headerRecord = [];
  const rawHeaders = incoming.rawHeaders;
  for (let i2 = 0; i2 < rawHeaders.length; i2 += 2) {
    const { [i2]: key, [i2 + 1]: value } = rawHeaders;
    if (key.charCodeAt(0) !== /*:*/
    58) {
      headerRecord.push([key, value]);
    }
  }
  const init = {
    method,
    headers: headerRecord,
    signal: abortController.signal
  };
  if (method === "TRACE") {
    init.method = "GET";
    const req = new Request(url, init);
    Object.defineProperty(req, "method", {
      get() {
        return "TRACE";
      }
    });
    return req;
  }
  if (!(method === "GET" || method === "HEAD")) {
    if ("rawBody" in incoming && incoming.rawBody instanceof Buffer) {
      init.body = new ReadableStream({
        start(controller) {
          controller.enqueue(incoming.rawBody);
          controller.close();
        }
      });
    } else {
      init.body = Readable.toWeb(incoming);
    }
  }
  return new Request(url, init);
};
var getRequestCache = Symbol("getRequestCache");
var requestCache = Symbol("requestCache");
var incomingKey = Symbol("incomingKey");
var urlKey = Symbol("urlKey");
var abortControllerKey = Symbol("abortControllerKey");
var getAbortController = Symbol("getAbortController");
var requestPrototype = {
  get method() {
    return this[incomingKey].method || "GET";
  },
  get url() {
    return this[urlKey];
  },
  [getAbortController]() {
    this[getRequestCache]();
    return this[abortControllerKey];
  },
  [getRequestCache]() {
    this[abortControllerKey] ||= new AbortController();
    return this[requestCache] ||= newRequestFromIncoming(
      this.method,
      this[urlKey],
      this[incomingKey],
      this[abortControllerKey]
    );
  }
};
[
  "body",
  "bodyUsed",
  "cache",
  "credentials",
  "destination",
  "headers",
  "integrity",
  "mode",
  "redirect",
  "referrer",
  "referrerPolicy",
  "signal",
  "keepalive"
].forEach((k) => {
  Object.defineProperty(requestPrototype, k, {
    get() {
      return this[getRequestCache]()[k];
    }
  });
});
["arrayBuffer", "blob", "clone", "formData", "json", "text"].forEach((k) => {
  Object.defineProperty(requestPrototype, k, {
    value: function() {
      return this[getRequestCache]()[k]();
    }
  });
});
Object.setPrototypeOf(requestPrototype, Request.prototype);
var buildOutgoingHttpHeaders = (headers) => {
  const res = {};
  if (!(headers instanceof Headers)) {
    headers = new Headers(headers ?? void 0);
  }
  const cookies = [];
  for (const [k, v] of headers) {
    if (k === "set-cookie") {
      cookies.push(v);
    } else {
      res[k] = v;
    }
  }
  if (cookies.length > 0) {
    res["set-cookie"] = cookies;
  }
  res["content-type"] ??= "text/plain; charset=UTF-8";
  return res;
};
var responseCache = Symbol("responseCache");
var getResponseCache = Symbol("getResponseCache");
var cacheKey = Symbol("cache");
var GlobalResponse = global.Response;
var Response2 = class _Response {
  #body;
  #init;
  [getResponseCache]() {
    delete this[cacheKey];
    return this[responseCache] ||= new GlobalResponse(this.#body, this.#init);
  }
  constructor(body, init) {
    this.#body = body;
    if (init instanceof _Response) {
      const cachedGlobalResponse = init[responseCache];
      if (cachedGlobalResponse) {
        this.#init = cachedGlobalResponse;
        this[getResponseCache]();
        return;
      } else {
        this.#init = init.#init;
      }
    } else {
      this.#init = init;
    }
    if (typeof body === "string" || typeof body?.getReader !== "undefined") {
      let headers = init?.headers || { "content-type": "text/plain; charset=UTF-8" };
      if (headers instanceof Headers) {
        headers = buildOutgoingHttpHeaders(headers);
      }
      this[cacheKey] = [init?.status || 200, body, headers];
    }
  }
};
[
  "body",
  "bodyUsed",
  "headers",
  "ok",
  "redirected",
  "status",
  "statusText",
  "trailers",
  "type",
  "url"
].forEach((k) => {
  Object.defineProperty(Response2.prototype, k, {
    get() {
      return this[getResponseCache]()[k];
    }
  });
});
["arrayBuffer", "blob", "clone", "formData", "json", "text"].forEach((k) => {
  Object.defineProperty(Response2.prototype, k, {
    value: function() {
      return this[getResponseCache]()[k]();
    }
  });
});
Object.setPrototypeOf(Response2, GlobalResponse);
Object.setPrototypeOf(Response2.prototype, GlobalResponse.prototype);
var stateKey = Reflect.ownKeys(new GlobalResponse()).find(
  (k) => typeof k === "symbol" && k.toString() === "Symbol(state)"
);
if (!stateKey) {
  console.warn("Failed to find Response internal state key");
}
var webFetch = global.fetch;
if (typeof global.crypto === "undefined") {
  global.crypto = crypto;
}
global.fetch = (info, init) => {
  init = {
    // Disable compression handling so people can return the result of a fetch
    // directly in the loader without messing with the Content-Encoding header.
    compress: false,
    ...init
  };
  return webFetch(info, init);
};
var COMPRESSIBLE_CONTENT_TYPE_REGEX = /^\s*(?:text\/[^;\s]+|application\/(?:javascript|json|xml|xml-dtd|ecmascript|dart|postscript|rtf|tar|toml|vnd\.dart|vnd\.ms-fontobject|vnd\.ms-opentype|wasm|x-httpd-php|x-javascript|x-ns-proxy-autoconfig|x-sh|x-tar|x-virtualbox-hdd|x-virtualbox-ova|x-virtualbox-ovf|x-virtualbox-vbox|x-virtualbox-vdi|x-virtualbox-vhd|x-virtualbox-vmdk|x-www-form-urlencoded)|font\/(?:otf|ttf)|image\/(?:bmp|vnd\.adobe\.photoshop|vnd\.microsoft\.icon|vnd\.ms-dds|x-icon|x-ms-bmp)|message\/rfc822|model\/gltf-binary|x-shader\/x-fragment|x-shader\/x-vertex|[^;\s]+?\+(?:json|text|xml|yaml))(?:[;\s]|$)/i;
var ENCODINGS = {
  br: ".br",
  zstd: ".zst",
  gzip: ".gz"
};
var ENCODINGS_ORDERED_KEYS = Object.keys(ENCODINGS);
var createStreamBody = (stream4) => {
  const body = new ReadableStream({
    start(controller) {
      stream4.on("data", (chunk) => {
        controller.enqueue(chunk);
      });
      stream4.on("end", () => {
        controller.close();
      });
    },
    cancel() {
      stream4.destroy();
    }
  });
  return body;
};
var addCurrentDirPrefix = (path) => {
  return `./${path}`;
};
var getStats = (path) => {
  let stats;
  try {
    stats = lstatSync(path);
  } catch {
  }
  return stats;
};
var serveStatic = (options = { root: "" }) => {
  return async (c2, next) => {
    if (c2.finalized) {
      return next();
    }
    let filename;
    try {
      filename = options.path ?? decodeURIComponent(c2.req.path);
    } catch {
      await options.onNotFound?.(c2.req.path, c2);
      return next();
    }
    let path = getFilePathWithoutDefaultDocument({
      filename: options.rewriteRequestPath ? options.rewriteRequestPath(filename) : filename,
      root: options.root
    });
    if (path) {
      path = addCurrentDirPrefix(path);
    } else {
      return next();
    }
    let stats = getStats(path);
    if (stats && stats.isDirectory()) {
      path = getFilePath({
        filename: options.rewriteRequestPath ? options.rewriteRequestPath(filename) : filename,
        root: options.root,
        defaultDocument: options.index ?? "index.html"
      });
      if (path) {
        path = addCurrentDirPrefix(path);
      } else {
        return next();
      }
      stats = getStats(path);
    }
    if (!stats) {
      await options.onNotFound?.(path, c2);
      return next();
    }
    await options.onFound?.(path, c2);
    const mimeType = getMimeType(path);
    c2.header("Content-Type", mimeType || "application/octet-stream");
    if (options.precompressed && (!mimeType || COMPRESSIBLE_CONTENT_TYPE_REGEX.test(mimeType))) {
      const acceptEncodingSet = new Set(
        c2.req.header("Accept-Encoding")?.split(",").map((encoding) => encoding.trim())
      );
      for (const encoding of ENCODINGS_ORDERED_KEYS) {
        if (!acceptEncodingSet.has(encoding)) {
          continue;
        }
        const precompressedStats = getStats(path + ENCODINGS[encoding]);
        if (precompressedStats) {
          c2.header("Content-Encoding", encoding);
          c2.header("Vary", "Accept-Encoding", { append: true });
          stats = precompressedStats;
          path = path + ENCODINGS[encoding];
          break;
        }
      }
    }
    const size = stats.size;
    if (c2.req.method == "HEAD" || c2.req.method == "OPTIONS") {
      c2.header("Content-Length", size.toString());
      c2.status(200);
      return c2.body(null);
    }
    const range = c2.req.header("range") || "";
    if (!range) {
      c2.header("Content-Length", size.toString());
      return c2.body(createStreamBody(createReadStream(path)), 200);
    }
    c2.header("Accept-Ranges", "bytes");
    c2.header("Date", stats.birthtime.toUTCString());
    const parts = range.replace(/bytes=/, "").split("-", 2);
    const start = parts[0] ? parseInt(parts[0], 10) : 0;
    let end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
    if (size < end - start + 1) {
      end = size - 1;
    }
    const chunksize = end - start + 1;
    const stream4 = createReadStream(path, { start, end });
    c2.header("Content-Length", chunksize.toString());
    c2.header("Content-Range", `bytes ${start}-${end}/${stats.size}`);
    return c2.body(createStreamBody(stream4), 206);
  };
};
var RENDER_TYPE = {
  STRING_ARRAY: "string_array",
  STRING: "string",
  JSON_STRING: "json_string",
  RAW: "raw"
};
var RENDER_TYPE_MAP = {
  configUrl: RENDER_TYPE.STRING,
  deepLinking: RENDER_TYPE.RAW,
  presets: RENDER_TYPE.STRING_ARRAY,
  plugins: RENDER_TYPE.STRING_ARRAY,
  spec: RENDER_TYPE.JSON_STRING,
  url: RENDER_TYPE.STRING,
  urls: RENDER_TYPE.JSON_STRING,
  layout: RENDER_TYPE.STRING,
  docExpansion: RENDER_TYPE.STRING,
  maxDisplayedTags: RENDER_TYPE.RAW,
  operationsSorter: RENDER_TYPE.RAW,
  requestInterceptor: RENDER_TYPE.RAW,
  responseInterceptor: RENDER_TYPE.RAW,
  persistAuthorization: RENDER_TYPE.RAW,
  defaultModelsExpandDepth: RENDER_TYPE.RAW,
  defaultModelExpandDepth: RENDER_TYPE.RAW,
  defaultModelRendering: RENDER_TYPE.STRING,
  displayRequestDuration: RENDER_TYPE.RAW,
  filter: RENDER_TYPE.RAW,
  showExtensions: RENDER_TYPE.RAW,
  showCommonExtensions: RENDER_TYPE.RAW,
  queryConfigEnabled: RENDER_TYPE.RAW,
  displayOperationId: RENDER_TYPE.RAW,
  tagsSorter: RENDER_TYPE.RAW,
  onComplete: RENDER_TYPE.RAW,
  syntaxHighlight: RENDER_TYPE.JSON_STRING,
  tryItOutEnabled: RENDER_TYPE.RAW,
  requestSnippetsEnabled: RENDER_TYPE.RAW,
  requestSnippets: RENDER_TYPE.JSON_STRING,
  oauth2RedirectUrl: RENDER_TYPE.STRING,
  showMutabledRequest: RENDER_TYPE.RAW,
  request: RENDER_TYPE.JSON_STRING,
  supportedSubmitMethods: RENDER_TYPE.JSON_STRING,
  validatorUrl: RENDER_TYPE.STRING,
  withCredentials: RENDER_TYPE.RAW,
  modelPropertyMacro: RENDER_TYPE.RAW,
  parameterMacro: RENDER_TYPE.RAW
};
var renderSwaggerUIOptions = (options) => {
  const optionsStrings = Object.entries(options).map(([k, v]) => {
    const key = k;
    if (!RENDER_TYPE_MAP[key] || v === void 0) {
      return "";
    }
    switch (RENDER_TYPE_MAP[key]) {
      case RENDER_TYPE.STRING:
        return `${key}: '${v}'`;
      case RENDER_TYPE.STRING_ARRAY:
        if (!Array.isArray(v)) {
          return "";
        }
        return `${key}: [${v.map((ve) => `${ve}`).join(",")}]`;
      case RENDER_TYPE.JSON_STRING:
        return `${key}: ${JSON.stringify(v)}`;
      case RENDER_TYPE.RAW:
        return `${key}: ${v}`;
      default:
        return "";
    }
  }).filter((item) => item !== "").join(",");
  return optionsStrings;
};
var remoteAssets = ({ version }) => {
  const url = `https://cdn.jsdelivr.net/npm/swagger-ui-dist${version !== void 0 ? `@${version}` : ""}`;
  return {
    css: [`${url}/swagger-ui.css`],
    js: [`${url}/swagger-ui-bundle.js`]
  };
};
var SwaggerUI = (options) => {
  const asset = remoteAssets({ version: options?.version });
  delete options.version;
  if (options.manuallySwaggerUIHtml) {
    return options.manuallySwaggerUIHtml(asset);
  }
  const optionsStrings = renderSwaggerUIOptions(options);
  return `
    <div>
      <div id="swagger-ui"></div>
      ${asset.css.map((url) => html`<link rel="stylesheet" href="${url}" />`)}
      ${asset.js.map((url) => html`<script src="${url}" crossorigin="anonymous"></script>`)}
      <script>
        window.onload = () => {
          window.ui = SwaggerUIBundle({
            dom_id: '#swagger-ui',${optionsStrings},
          })
        }
      </script>
    </div>
  `;
};
var middleware = (options) => async (c2) => {
  const title = options?.title ?? "SwaggerUI";
  return c2.html(
    /* html */
    `
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="description" content="SwaggerUI" />
          <title>${title}</title>
        </head>
        <body>
          ${SwaggerUI(options)}
        </body>
      </html>
    `
  );
};

// ../../node_modules/.pnpm/hono-openapi@0.4.6_hono@4.7.7_openapi-types@12.1.3_zod@3.24.4/node_modules/hono-openapi/utils.js
var e = Symbol("openapi");
var s2 = ["GET", "PUT", "POST", "DELETE", "OPTIONS", "HEAD", "PATCH", "TRACE"];
var n = (e2) => e2.charAt(0).toUpperCase() + e2.slice(1);
var o = /* @__PURE__ */ new Map();
var a = (e2, t2) => {
  const s3 = `${e2}:${t2}`;
  if (o.has(s3)) return o.get(s3);
  let a2 = e2;
  if ("/" === t2) return `${a2}Index`;
  for (const e3 of t2.split("/")) 123 === e3.charCodeAt(0) ? a2 += `By${n(e3.slice(1, -1))}` : a2 += n(e3);
  return o.set(s3, a2), a2;
};
var r = /* @__PURE__ */ new Map();
function c(e2, t2, s3) {
  return e2 && t2 in e2 ? e2[t2] ?? s3 : s3;
}
function i(...e2) {
  return e2.reduce((e3, t2) => {
    if (!t2) return e3;
    let s3;
    return ("tags" in e3 && e3.tags || "tags" in t2 && t2.tags) && (s3 = [...c(e3, "tags", []), ...c(t2, "tags", [])]), { ...e3, ...t2, tags: s3, responses: { ...c(e3, "responses", {}), ...c(t2, "responses", {}) }, parameters: m(e3.parameters, t2.parameters) };
  }, {});
}
function p({ path: e2, method: t2, data: s3, schema: n2 }) {
  e2 = ((e3) => e3.split("/").map((e4) => {
    let t3 = e4;
    return t3.startsWith(":") && (t3 = t3.slice(1, t3.length), t3.endsWith("?") && (t3 = t3.slice(0, -1)), t3 = `{${t3}}`), t3;
  }).join("/"))(e2);
  const o2 = t2.toLowerCase();
  if ("all" === o2) if (r.has(e2)) {
    const t3 = r.get(e2) ?? {};
    r.set(e2, { ...t3, ...s3, parameters: m(t3.parameters, s3.parameters) });
  } else r.set(e2, s3);
  else {
    const t3 = function(e3) {
      const t4 = Array.from(r.keys());
      let s4 = {};
      for (const n3 of t4) e3.match(n3) && (s4 = i(s4, r.get(n3) ?? {}));
      return s4;
    }(e2);
    n2[e2] = { ...n2[e2] ? n2[e2] : {}, [o2]: { responses: {}, operationId: a(o2, e2), ...i(t3, n2[e2]?.[o2], s3) } };
  }
}
var l = (e2) => "$ref" in e2 ? e2.$ref : `${e2.in} ${e2.name}`;
function m(...e2) {
  const t2 = e2.flatMap((e3) => e3 ?? []).reduce((e3, t3) => (e3.set(l(t3), t3), e3), /* @__PURE__ */ new Map());
  return Array.from(t2.values());
}
function u(e2, { excludeStaticFile: t2 = true, exclude: s3 = [] }) {
  const n2 = {}, o2 = Array.isArray(s3) ? s3 : [s3];
  for (const [s4, a2] of Object.entries(e2)) if (!(o2.some((e3) => "string" == typeof e3 ? s4 === e3 : e3.test(s4)) || s4.includes("*") || t2 && s4.includes("."))) {
    for (const e3 of Object.keys(a2)) {
      const t3 = a2[e3];
      if (s4.includes("{")) {
        t3.parameters || (t3.parameters = []);
        const e4 = s4.split("/").filter((e5) => e5.startsWith("{") && !t3.parameters.find((t4) => "path" === t4.in && t4.name === e5.slice(1, e5.length - 1)));
        for (const s5 of e4) {
          const e5 = s5.slice(1, s5.length - 1), n3 = t3.parameters.findIndex((t4) => "param" === t4.in && t4.name === e5);
          -1 !== n3 ? t3.parameters[n3].in = "path" : t3.parameters.push({ schema: { type: "string" }, in: "path", name: e5, required: true });
        }
      }
      t3.responses || (t3.responses = { 200: {} });
    }
    n2[s4] = a2;
  }
  return n2;
}
function f(e2, t2) {
  const s3 = { version: "3.1.0", components: {} };
  let n2 = null;
  return async (o2) => (n2 || (n2 = await d(e2, t2, s3, o2)), o2.json(n2));
}
async function d(t2, { documentation: n2 = {}, excludeStaticFile: o2 = true, exclude: a2 = [], excludeMethods: r2 = ["OPTIONS"], excludeTags: c2 = [], defaultOptions: i2 } = { documentation: {}, excludeStaticFile: true, exclude: [], excludeMethods: ["OPTIONS"], excludeTags: [] }, { version: l2 = "3.1.0", components: m2 = {} } = { version: "3.1.0", components: {} }, f2) {
  const d2 = { version: l2, components: m2 }, h2 = {};
  for (const n3 of t2.routes) {
    if (!(e in n3.handler)) continue;
    if (r2.includes(n3.method)) continue;
    if (false === s2.includes(n3.method) && "ALL" !== n3.method) continue;
    const { resolver: t3, metadata: o3 = {} } = n3.handler[e], a3 = i2?.[n3.method], { docs: c3, components: l3 } = await t3({ ...d2, ...o3 }, a3);
    d2.components = { ...d2.components, ...l3 ?? {} }, p({ method: n3.method, path: n3.path, data: c3, schema: h2 });
  }
  for (const e2 in h2) for (const t3 in h2[e2]) {
    const s3 = h2[e2][t3]?.hide;
    s3 && ("boolean" == typeof s3 ? s3 : f2 && s3(f2)) && delete h2[e2][t3];
  }
  return { openapi: d2.version, ...{ ...n2, tags: n2.tags?.filter((e2) => !c2?.includes(e2?.name)), info: { title: "Hono Documentation", description: "Development documentation", version: "0.0.0", ...n2.info }, paths: { ...u(h2, { excludeStaticFile: o2, exclude: a2 }), ...n2.paths }, components: { ...n2.components, schemas: { ...d2.components, ...n2.components?.schemas } } } };
}
function h(s3) {
  const { validateResponse: n2, ...o2 } = s3;
  return Object.assign(async (e2, o3) => {
    if (await o3(), n2 && s3.responses) {
      const o4 = e2.res.status, a2 = e2.res.headers.get("content-type");
      if (o4 && a2) {
        const r2 = s3.responses[o4];
        if (r2 && "content" in r2 && r2.content) {
          const s4 = a2.split(";")[0], o5 = r2.content[s4];
          if (o5?.schema && "validator" in o5.schema) try {
            let t2;
            const n3 = e2.res.clone();
            if ("application/json" === s4 ? t2 = await n3.json() : "text/plain" === s4 && (t2 = await n3.text()), !t2) throw new Error("No data to validate!");
            await o5.schema.validator(t2);
          } catch (e3) {
            let s5 = { status: 500, message: "Response validation failed!" };
            throw "object" == typeof n2 && (s5 = { ...s5, ...n2 }), new HTTPException$1(s5.status, { message: s5.message, cause: e3 });
          }
        }
      }
    }
  }, { [e]: { resolver: (e2, t2) => x(e2, o2, t2) } });
}
async function x(e2, t2, s3 = {}) {
  let n2 = {};
  const o2 = { ...s3, ...t2, responses: { ...s3?.responses, ...t2.responses } };
  if (o2.responses) for (const t3 of Object.keys(o2.responses)) {
    const s4 = o2.responses[t3];
    if (s4 && "content" in s4) for (const t4 of Object.keys(s4.content ?? {})) {
      const o3 = s4.content?.[t4];
      if (o3 && (o3.schema && "builder" in o3.schema)) {
        const t5 = await o3.schema.builder(e2);
        o3.schema = t5.schema, t5.components && (n2 = { ...n2, ...t5.components });
      }
    }
  }
  return { docs: o2, components: n2 };
}
async function getAgentCardByIdHandler(c2) {
  const mastra = c2.get("mastra");
  const agentId = c2.req.param("agentId");
  const runtimeContext = c2.get("runtimeContext");
  const result = await getAgentCardByIdHandler$1({
    mastra,
    agentId,
    runtimeContext
  });
  return c2.json(result);
}
async function getAgentExecutionHandler(c2) {
  const mastra = c2.get("mastra");
  const agentId = c2.req.param("agentId");
  const runtimeContext = c2.get("runtimeContext");
  const logger2 = mastra.getLogger();
  const body = await c2.req.json();
  if (!["tasks/send", "tasks/sendSubscribe", "tasks/get", "tasks/cancel"].includes(body.method)) {
    return c2.json({ error: { message: `Unsupported method: ${body.method}`, code: "invalid_method" } }, 400);
  }
  const result = await getAgentExecutionHandler$1({
    mastra,
    agentId,
    runtimeContext,
    requestId: randomUUID(),
    method: body.method,
    params: body.params,
    logger: logger2
  });
  if (body.method === "tasks/sendSubscribe") {
    return stream(
      c2,
      async (stream4) => {
        try {
          stream4.onAbort(() => {
            if (!result.locked) {
              return result.cancel();
            }
          });
          for await (const chunk of result) {
            await stream4.write(JSON.stringify(chunk) + "");
          }
        } catch (err) {
          logger2.error("Error in tasks/sendSubscribe stream: " + err?.message);
        }
      },
      async (err) => {
        logger2.error("Error in tasks/sendSubscribe stream: " + err?.message);
      }
    );
  }
  return c2.json(result);
}
function handleError(error, defaultMessage) {
  const apiError = error;
  throw new HTTPException$1(apiError.status || 500, {
    message: apiError.message || defaultMessage
  });
}
function errorHandler(err, c2) {
  if (err instanceof HTTPException$1) {
    return c2.json({ error: err.message }, err.status);
  }
  console.error(err);
  return c2.json({ error: "Internal Server Error" }, 500);
}

// src/server/handlers/agents.ts
async function getAgentsHandler(c2) {
  const serializedAgents = await getAgentsHandler$1({
    mastra: c2.get("mastra"),
    runtimeContext: c2.get("runtimeContext")
  });
  return c2.json(serializedAgents);
}
async function getAgentByIdHandler(c2) {
  const mastra = c2.get("mastra");
  const agentId = c2.req.param("agentId");
  const runtimeContext = c2.get("runtimeContext");
  const result = await getAgentByIdHandler$1({
    mastra,
    agentId,
    runtimeContext
  });
  return c2.json(result);
}
async function getEvalsByAgentIdHandler(c2) {
  const mastra = c2.get("mastra");
  const agentId = c2.req.param("agentId");
  const runtimeContext = c2.get("runtimeContext");
  const result = await getEvalsByAgentIdHandler$1({
    mastra,
    agentId,
    runtimeContext
  });
  return c2.json(result);
}
async function getLiveEvalsByAgentIdHandler(c2) {
  const mastra = c2.get("mastra");
  const agentId = c2.req.param("agentId");
  const runtimeContext = c2.get("runtimeContext");
  const result = await getLiveEvalsByAgentIdHandler$1({
    mastra,
    agentId,
    runtimeContext
  });
  return c2.json(result);
}
async function generateHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const agentId = c2.req.param("agentId");
    const runtimeContext = c2.get("runtimeContext");
    const body = await c2.req.json();
    const result = await generateHandler$2({
      mastra,
      agentId,
      runtimeContext,
      body
    });
    return c2.json(result);
  } catch (error) {
    return handleError(error, "Error generating from agent");
  }
}
async function streamGenerateHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const agentId = c2.req.param("agentId");
    const runtimeContext = c2.get("runtimeContext");
    const body = await c2.req.json();
    const streamResponse = await streamGenerateHandler$2({
      mastra,
      agentId,
      runtimeContext,
      body
    });
    return streamResponse;
  } catch (error) {
    return handleError(error, "Error streaming from agent");
  }
}
async function setAgentInstructionsHandler(c2) {
  try {
    const isPlayground = c2.get("playground") === true;
    if (!isPlayground) {
      return c2.json({ error: "This API is only available in the playground environment" }, 403);
    }
    const agentId = c2.req.param("agentId");
    const { instructions } = await c2.req.json();
    if (!agentId || !instructions) {
      return c2.json({ error: "Missing required fields" }, 400);
    }
    const mastra = c2.get("mastra");
    const agent = mastra.getAgent(agentId);
    if (!agent) {
      return c2.json({ error: "Agent not found" }, 404);
    }
    agent.__updateInstructions(instructions);
    return c2.json(
      {
        instructions
      },
      200
    );
  } catch (error) {
    return handleError(error, "Error setting agent instructions");
  }
}

// src/server/handlers/client.ts
var clients = /* @__PURE__ */ new Set();
function handleClientsRefresh(c2) {
  const stream4 = new ReadableStream({
    start(controller) {
      clients.add(controller);
      controller.enqueue("data: connected\n\n");
      c2.req.raw.signal.addEventListener("abort", () => {
        clients.delete(controller);
      });
    }
  });
  return new Response(stream4, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
function handleTriggerClientsRefresh(c2) {
  clients.forEach((controller) => {
    try {
      controller.enqueue("data: refresh\n\n");
    } catch {
      clients.delete(controller);
    }
  });
  return c2.json({ success: true, clients: clients.size });
}
async function getLogsHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const transportId = c2.req.query("transportId");
    const logs = await getLogsHandler$1({
      mastra,
      transportId
    });
    return c2.json(logs);
  } catch (error) {
    return handleError(error, "Error getting logs");
  }
}
async function getLogsByRunIdHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const runId = c2.req.param("runId");
    const transportId = c2.req.query("transportId");
    const logs = await getLogsByRunIdHandler$1({
      mastra,
      runId,
      transportId
    });
    return c2.json(logs);
  } catch (error) {
    return handleError(error, "Error getting logs by run ID");
  }
}
async function getLogTransports(c2) {
  try {
    const mastra = c2.get("mastra");
    const result = await getLogTransports$1({
      mastra
    });
    return c2.json(result);
  } catch (error) {
    return handleError(error, "Error getting log Transports");
  }
}
var classRegExp = /^([A-Z][a-z0-9]*)+$/;
var kTypes = [
  "string",
  "function",
  "number",
  "object",
  // Accept 'Function' and 'Object' as alternative to the lower cased version.
  "Function",
  "Object",
  "boolean",
  "bigint",
  "symbol"
];
function determineSpecificType(value) {
  if (value == null) {
    return "" + value;
  }
  if (typeof value === "function" && value.name) {
    return `function ${value.name}`;
  }
  if (typeof value === "object") {
    if (value.constructor?.name) {
      return `an instance of ${value.constructor.name}`;
    }
    return `${util.inspect(value, { depth: -1 })}`;
  }
  let inspected = util.inspect(value, { colors: false });
  if (inspected.length > 28) {
    inspected = `${inspected.slice(0, 25)}...`;
  }
  return `type ${typeof value} (${inspected})`;
}
var ERR_HTTP_BODY_NOT_ALLOWED = class extends Error {
  constructor() {
    super("Adding content for this request method or response status is not allowed.");
  }
};
var ERR_HTTP_CONTENT_LENGTH_MISMATCH = class extends Error {
  constructor(actual, expected) {
    super(`Response body's content-length of ${actual} byte(s) does not match the content-length of ${expected} byte(s) set in header`);
  }
};
var ERR_HTTP_HEADERS_SENT = class extends Error {
  constructor(arg) {
    super(`Cannot ${arg} headers after they are sent to the client`);
  }
};
var ERR_INVALID_ARG_VALUE = class extends TypeError {
  constructor(name, value, reason = "is invalid") {
    let inspected = util.inspect(value);
    if (inspected.length > 128) {
      inspected = `${inspected.slice(0, 128)}...`;
    }
    const type = name.includes(".") ? "property" : "argument";
    super(`The ${type} '${name}' ${reason}. Received ${inspected}`);
  }
};
var ERR_INVALID_CHAR = class extends TypeError {
  constructor(name, field) {
    let msg = `Invalid character in ${name}`;
    if (field !== void 0) {
      msg += ` ["${field}"]`;
    }
    super(msg);
  }
};
var ERR_HTTP_INVALID_HEADER_VALUE = class extends TypeError {
  constructor(value, name) {
    super(`Invalid value "${value}" for header "${name}"`);
  }
};
var ERR_HTTP_INVALID_STATUS_CODE = class extends RangeError {
  originalStatusCode;
  constructor(originalStatusCode) {
    super(`Invalid status code: ${originalStatusCode}`);
    this.originalStatusCode = originalStatusCode;
  }
};
var ERR_HTTP_TRAILER_INVALID = class extends Error {
  constructor() {
    super(`Trailers are invalid with this transfer encoding`);
  }
};
var ERR_INVALID_ARG_TYPE = class extends TypeError {
  constructor(name, expected, actual) {
    if (!Array.isArray(expected)) {
      expected = [expected];
    }
    let msg = "The ";
    if (name.endsWith(" argument")) {
      msg += `${name} `;
    } else {
      const type = name.includes(".") ? "property" : "argument";
      msg += `"${name}" ${type} `;
    }
    msg += "must be ";
    const types = [];
    const instances = [];
    const other = [];
    for (const value of expected) {
      if (kTypes.includes(value)) {
        types.push(value.toLowerCase());
      } else if (classRegExp.exec(value) !== null) {
        instances.push(value);
      } else {
        other.push(value);
      }
    }
    if (instances.length > 0) {
      const pos = types.indexOf("object");
      if (pos !== -1) {
        types.splice(pos, 1);
        instances.push("Object");
      }
    }
    if (types.length > 0) {
      if (types.length > 2) {
        const last = types.pop();
        msg += `one of type ${types.join(", ")}, or ${last}`;
      } else if (types.length === 2) {
        msg += `one of type ${types[0]} or ${types[1]}`;
      } else {
        msg += `of type ${types[0]}`;
      }
      if (instances.length > 0 || other.length > 0)
        msg += " or ";
    }
    if (instances.length > 0) {
      if (instances.length > 2) {
        const last = instances.pop();
        msg += `an instance of ${instances.join(", ")}, or ${last}`;
      } else {
        msg += `an instance of ${instances[0]}`;
        if (instances.length === 2) {
          msg += ` or ${instances[1]}`;
        }
      }
      if (other.length > 0)
        msg += " or ";
    }
    if (other.length > 0) {
      if (other.length > 2) {
        const last = other.pop();
        msg += `one of ${other.join(", ")}, or ${last}`;
      } else if (other.length === 2) {
        msg += `one of ${other[0]} or ${other[1]}`;
      } else {
        if (other[0].toLowerCase() !== other[0])
          msg += "an ";
        msg += `${other[0]}`;
      }
    }
    msg += `. Received ${determineSpecificType(actual)}`;
    super(msg);
  }
};
var ERR_INVALID_HTTP_TOKEN = class extends TypeError {
  constructor(name, field) {
    super(`${name} must be a valid HTTP token ["${field}"]`);
  }
};
var ERR_METHOD_NOT_IMPLEMENTED = class extends Error {
  constructor(methodName) {
    super(`The ${methodName} method is not implemented`);
  }
};
var ERR_STREAM_ALREADY_FINISHED = class extends Error {
  constructor(methodName) {
    super(`Cannot call ${methodName} after a stream was finished`);
  }
};
var ERR_STREAM_CANNOT_PIPE = class extends Error {
  constructor() {
    super(`Cannot pipe, not readable`);
  }
};
var ERR_STREAM_DESTROYED = class extends Error {
  constructor(methodName) {
    super(`Cannot call ${methodName} after a stream was destroyed`);
  }
};
var ERR_STREAM_NULL_VALUES = class extends TypeError {
  constructor() {
    super(`May not write null values to stream`);
  }
};
var ERR_STREAM_WRITE_AFTER_END = class extends Error {
  constructor() {
    super(`write after end`);
  }
};

// ../../node_modules/.pnpm/fetch-to-node@2.1.0/node_modules/fetch-to-node/dist/fetch-to-node/http-incoming.js
var kHeaders = Symbol("kHeaders");
var kHeadersDistinct = Symbol("kHeadersDistinct");
var kHeadersCount = Symbol("kHeadersCount");
var kTrailers = Symbol("kTrailers");
var kTrailersDistinct = Symbol("kTrailersDistinct");
var kTrailersCount = Symbol("kTrailersCount");
var FetchIncomingMessage = class extends Readable$1 {
  get socket() {
    return null;
  }
  set socket(_val) {
    throw new ERR_METHOD_NOT_IMPLEMENTED("socket");
  }
  httpVersionMajor;
  httpVersionMinor;
  httpVersion;
  complete = false;
  [kHeaders] = null;
  [kHeadersDistinct] = null;
  [kHeadersCount] = 0;
  rawHeaders = [];
  [kTrailers] = null;
  [kTrailersDistinct] = null;
  [kTrailersCount] = 0;
  rawTrailers = [];
  joinDuplicateHeaders = false;
  aborted = false;
  upgrade = false;
  // request (server) only
  url = "";
  method;
  // TODO: Support ClientRequest
  // statusCode = null;
  // statusMessage = null;
  // client = socket;
  _consuming;
  _dumped;
  // The underlying ReadableStream
  _stream = null;
  constructor() {
    const streamOptions = {};
    super(streamOptions);
    this._readableState.readingMore = true;
    this._consuming = false;
    this._dumped = false;
  }
  get connection() {
    return null;
  }
  set connection(_socket) {
    console.error("No support for IncomingMessage.connection");
  }
  get headers() {
    if (!this[kHeaders]) {
      this[kHeaders] = {};
      const src = this.rawHeaders;
      const dst = this[kHeaders];
      for (let n2 = 0; n2 < this[kHeadersCount]; n2 += 2) {
        this._addHeaderLine(src[n2], src[n2 + 1], dst);
      }
    }
    return this[kHeaders];
  }
  set headers(val) {
    this[kHeaders] = val;
  }
  get headersDistinct() {
    if (!this[kHeadersDistinct]) {
      this[kHeadersDistinct] = {};
      const src = this.rawHeaders;
      const dst = this[kHeadersDistinct];
      for (let n2 = 0; n2 < this[kHeadersCount]; n2 += 2) {
        this._addHeaderLineDistinct(src[n2], src[n2 + 1], dst);
      }
    }
    return this[kHeadersDistinct];
  }
  set headersDistinct(val) {
    this[kHeadersDistinct] = val;
  }
  get trailers() {
    if (!this[kTrailers]) {
      this[kTrailers] = {};
      const src = this.rawTrailers;
      const dst = this[kTrailers];
      for (let n2 = 0; n2 < this[kTrailersCount]; n2 += 2) {
        this._addHeaderLine(src[n2], src[n2 + 1], dst);
      }
    }
    return this[kTrailers];
  }
  set trailers(val) {
    this[kTrailers] = val;
  }
  get trailersDistinct() {
    if (!this[kTrailersDistinct]) {
      this[kTrailersDistinct] = {};
      const src = this.rawTrailers;
      const dst = this[kTrailersDistinct];
      for (let n2 = 0; n2 < this[kTrailersCount]; n2 += 2) {
        this._addHeaderLineDistinct(src[n2], src[n2 + 1], dst);
      }
    }
    return this[kTrailersDistinct];
  }
  set trailersDistinct(val) {
    this[kTrailersDistinct] = val;
  }
  setTimeout(msecs, callback) {
    return this;
  }
  async _read(n2) {
    if (!this._consuming) {
      this._readableState.readingMore = false;
      this._consuming = true;
    }
    if (this._stream == null) {
      this.complete = true;
      this.push(null);
      return;
    }
    const reader = this._stream.getReader();
    try {
      const data = await reader.read();
      if (data.done) {
        this.complete = true;
        this.push(null);
      } else {
        this.push(data.value);
      }
    } catch (e2) {
      this.destroy(e2);
    } finally {
      reader.releaseLock();
    }
  }
  _destroy(err, cb) {
    if (!this.readableEnded || !this.complete) {
      this.aborted = true;
      this.emit("aborted");
    }
    setTimeout(onError, 0, this, err, cb);
  }
  _addHeaderLines(headers, n2) {
    if (headers?.length) {
      let dest;
      if (this.complete) {
        this.rawTrailers = headers;
        this[kTrailersCount] = n2;
        dest = this[kTrailers];
      } else {
        this.rawHeaders = headers;
        this[kHeadersCount] = n2;
        dest = this[kHeaders];
      }
      if (dest) {
        for (let i2 = 0; i2 < n2; i2 += 2) {
          this._addHeaderLine(headers[i2], headers[i2 + 1], dest);
        }
      }
    }
  }
  // Add the given (field, value) pair to the message
  //
  // Per RFC2616, section 4.2 it is acceptable to join multiple instances of the
  // same header with a ', ' if the header in question supports specification of
  // multiple values this way. The one exception to this is the Cookie header,
  // which has multiple values joined with a '; ' instead. If a header's values
  // cannot be joined in either of these ways, we declare the first instance the
  // winner and drop the second. Extended header fields (those beginning with
  // 'x-') are always joined.
  _addHeaderLine(field, value, dest) {
    field = matchKnownFields(field);
    const flag = field.charCodeAt(0);
    if (flag === 0 || flag === 2) {
      field = field.slice(1);
      if (typeof dest[field] === "string") {
        dest[field] += (flag === 0 ? ", " : "; ") + value;
      } else {
        dest[field] = value;
      }
    } else if (flag === 1) {
      if (dest["set-cookie"] !== void 0) {
        dest["set-cookie"].push(value);
      } else {
        dest["set-cookie"] = [value];
      }
    } else if (this.joinDuplicateHeaders) {
      if (dest[field] === void 0) {
        dest[field] = value;
      } else {
        dest[field] += ", " + value;
      }
    } else if (dest[field] === void 0) {
      dest[field] = value;
    }
  }
  _addHeaderLineDistinct(field, value, dest) {
    field = field.toLowerCase();
    if (!dest[field]) {
      dest[field] = [value];
    } else {
      dest[field].push(value);
    }
  }
  // Call this instead of resume() if we want to just
  // dump all the data to /dev/null
  _dump() {
    if (!this._dumped) {
      this._dumped = true;
      this.removeAllListeners("data");
      this.resume();
    }
  }
};
function matchKnownFields(field, lowercased = false) {
  switch (field.length) {
    case 3:
      if (field === "Age" || field === "age")
        return "age";
      break;
    case 4:
      if (field === "Host" || field === "host")
        return "host";
      if (field === "From" || field === "from")
        return "from";
      if (field === "ETag" || field === "etag")
        return "etag";
      if (field === "Date" || field === "date")
        return "\0date";
      if (field === "Vary" || field === "vary")
        return "\0vary";
      break;
    case 6:
      if (field === "Server" || field === "server")
        return "server";
      if (field === "Cookie" || field === "cookie")
        return "cookie";
      if (field === "Origin" || field === "origin")
        return "\0origin";
      if (field === "Expect" || field === "expect")
        return "\0expect";
      if (field === "Accept" || field === "accept")
        return "\0accept";
      break;
    case 7:
      if (field === "Referer" || field === "referer")
        return "referer";
      if (field === "Expires" || field === "expires")
        return "expires";
      if (field === "Upgrade" || field === "upgrade")
        return "\0upgrade";
      break;
    case 8:
      if (field === "Location" || field === "location")
        return "location";
      if (field === "If-Match" || field === "if-match")
        return "\0if-match";
      break;
    case 10:
      if (field === "User-Agent" || field === "user-agent")
        return "user-agent";
      if (field === "Set-Cookie" || field === "set-cookie")
        return "";
      if (field === "Connection" || field === "connection")
        return "\0connection";
      break;
    case 11:
      if (field === "Retry-After" || field === "retry-after")
        return "retry-after";
      break;
    case 12:
      if (field === "Content-Type" || field === "content-type")
        return "content-type";
      if (field === "Max-Forwards" || field === "max-forwards")
        return "max-forwards";
      break;
    case 13:
      if (field === "Authorization" || field === "authorization")
        return "authorization";
      if (field === "Last-Modified" || field === "last-modified")
        return "last-modified";
      if (field === "Cache-Control" || field === "cache-control")
        return "\0cache-control";
      if (field === "If-None-Match" || field === "if-none-match")
        return "\0if-none-match";
      break;
    case 14:
      if (field === "Content-Length" || field === "content-length")
        return "content-length";
      break;
    case 15:
      if (field === "Accept-Encoding" || field === "accept-encoding")
        return "\0accept-encoding";
      if (field === "Accept-Language" || field === "accept-language")
        return "\0accept-language";
      if (field === "X-Forwarded-For" || field === "x-forwarded-for")
        return "\0x-forwarded-for";
      break;
    case 16:
      if (field === "Content-Encoding" || field === "content-encoding")
        return "\0content-encoding";
      if (field === "X-Forwarded-Host" || field === "x-forwarded-host")
        return "\0x-forwarded-host";
      break;
    case 17:
      if (field === "If-Modified-Since" || field === "if-modified-since")
        return "if-modified-since";
      if (field === "Transfer-Encoding" || field === "transfer-encoding")
        return "\0transfer-encoding";
      if (field === "X-Forwarded-Proto" || field === "x-forwarded-proto")
        return "\0x-forwarded-proto";
      break;
    case 19:
      if (field === "Proxy-Authorization" || field === "proxy-authorization")
        return "proxy-authorization";
      if (field === "If-Unmodified-Since" || field === "if-unmodified-since")
        return "if-unmodified-since";
      break;
  }
  if (lowercased) {
    return "\0" + field;
  }
  return matchKnownFields(field.toLowerCase(), true);
}
function onError(self, error, cb) {
  if (self.listenerCount("error") === 0) {
    cb();
  } else {
    cb(error);
  }
}

// ../../node_modules/.pnpm/fetch-to-node@2.1.0/node_modules/fetch-to-node/dist/utils/types.js
function validateString(value, name) {
  if (typeof value !== "string")
    throw new ERR_INVALID_ARG_TYPE(name, "string", value);
}
var linkValueRegExp = /^(?:<[^>]*>)(?:\s*;\s*[^;"\s]+(?:=(")?[^;"\s]*\1)?)*$/;
function validateLinkHeaderFormat(value, name) {
  if (typeof value === "undefined" || !linkValueRegExp.exec(value)) {
    throw new ERR_INVALID_ARG_VALUE(name, value, 'must be an array or string of format "</styles.css>; rel=preload; as=style"');
  }
}
function validateLinkHeaderValue(hints) {
  if (typeof hints === "string") {
    validateLinkHeaderFormat(hints, "hints");
    return hints;
  } else if (Array.isArray(hints)) {
    const hintsLength = hints.length;
    let result = "";
    if (hintsLength === 0) {
      return result;
    }
    for (let i2 = 0; i2 < hintsLength; i2++) {
      const link = hints[i2];
      validateLinkHeaderFormat(link, "hints");
      result += link;
      if (i2 !== hintsLength - 1) {
        result += ", ";
      }
    }
    return result;
  }
  throw new ERR_INVALID_ARG_VALUE("hints", hints, 'must be an array or string of format "</styles.css>; rel=preload; as=style"');
}
function isUint8Array(value) {
  return value != null && value[Symbol.toStringTag] === "Uint8Array";
}

// ../../node_modules/.pnpm/fetch-to-node@2.1.0/node_modules/fetch-to-node/dist/fetch-to-node/internal-http.js
var kNeedDrain = Symbol("kNeedDrain");
var kOutHeaders = Symbol("kOutHeaders");
function utcDate() {
  return (/* @__PURE__ */ new Date()).toUTCString();
}

// ../../node_modules/.pnpm/fetch-to-node@2.1.0/node_modules/fetch-to-node/dist/fetch-to-node/internal-streams-state.js
function getDefaultHighWaterMark(objectMode) {
  return objectMode ? 16 : 64 * 1024;
}

// ../../node_modules/.pnpm/fetch-to-node@2.1.0/node_modules/fetch-to-node/dist/fetch-to-node/http-common.js
var tokenRegExp = /^[\^_`a-zA-Z\-0-9!#$%&'*+.|~]+$/;
function checkIsHttpToken(val) {
  return tokenRegExp.test(val);
}
var headerCharRegex = /[^\t\x20-\x7e\x80-\xff]/;
function checkInvalidHeaderChar(val) {
  return headerCharRegex.test(val);
}
var chunkExpression = /(?:^|\W)chunked(?:$|\W)/i;
var kCorked = Symbol("corked");
var kChunkedBuffer = Symbol("kChunkedBuffer");
var kChunkedLength = Symbol("kChunkedLength");
var kUniqueHeaders = Symbol("kUniqueHeaders");
var kBytesWritten = Symbol("kBytesWritten");
var kErrored = Symbol("errored");
var kHighWaterMark = Symbol("kHighWaterMark");
var kRejectNonStandardBodyWrites = Symbol("kRejectNonStandardBodyWrites");
var nop = () => {
};
var RE_CONN_CLOSE = /(?:^|\W)close(?:$|\W)/i;
function isCookieField(s3) {
  return s3.length === 6 && s3.toLowerCase() === "cookie";
}
function isContentDispositionField(s3) {
  return s3.length === 19 && s3.toLowerCase() === "content-disposition";
}
var WrittenDataBuffer = class {
  [kCorked] = 0;
  [kHighWaterMark] = getDefaultHighWaterMark();
  entries = [];
  onWrite;
  constructor(params = {}) {
    this.onWrite = params.onWrite;
  }
  write(data, encoding, callback) {
    this.entries.push({
      data,
      length: data.length,
      encoding,
      callback,
      written: false
    });
    this._flush();
    return true;
  }
  cork() {
    this[kCorked]++;
  }
  uncork() {
    this[kCorked]--;
    this._flush();
  }
  _flush() {
    if (this[kCorked] <= 0) {
      for (const [index, entry] of this.entries.entries()) {
        if (!entry.written) {
          entry.written = true;
          if (this.onWrite != null) {
            this.onWrite(index, entry);
          }
          if (entry.callback != null) {
            entry.callback.call(void 0);
          }
        }
      }
    }
  }
  get writableLength() {
    return this.entries.reduce((acc, entry) => {
      return acc + (entry.written && entry.length ? entry.length : 0);
    }, 0);
  }
  get writableHighWaterMark() {
    return this[kHighWaterMark];
  }
  get writableCorked() {
    return this[kCorked];
  }
};
var FetchOutgoingMessage = class extends Writable {
  req;
  outputData;
  outputSize;
  // Difference from Node.js -
  // `writtenHeaderBytes` is the number of bytes the header has taken.
  // Since Node.js writes both the headers and body into the same outgoing
  // stream, it helps to keep track of this so that we can skip that many bytes
  // from the beginning of the stream when providing the outgoing stream.
  writtenHeaderBytes = 0;
  _last;
  chunkedEncoding;
  shouldKeepAlive;
  maxRequestsOnConnectionReached;
  _defaultKeepAlive;
  useChunkedEncodingByDefault;
  sendDate;
  _removedConnection;
  _removedContLen;
  _removedTE;
  strictContentLength;
  [kBytesWritten];
  _contentLength;
  _hasBody;
  _trailer;
  [kNeedDrain];
  finished;
  _headerSent;
  [kCorked];
  [kChunkedBuffer];
  [kChunkedLength];
  _closed;
  // Difference from Node.js -
  // In Node.js, this is a socket object.
  // [kSocket]: null;
  _header;
  [kOutHeaders];
  _keepAliveTimeout;
  _maxRequestsPerSocket;
  _onPendingData;
  [kUniqueHeaders];
  [kErrored];
  [kHighWaterMark];
  [kRejectNonStandardBodyWrites];
  _writtenDataBuffer = new WrittenDataBuffer({
    onWrite: this._onDataWritten.bind(this)
  });
  constructor(req, options) {
    super();
    this.req = req;
    this.outputData = [];
    this.outputSize = 0;
    this.destroyed = false;
    this._last = false;
    this.chunkedEncoding = false;
    this.shouldKeepAlive = true;
    this.maxRequestsOnConnectionReached = false;
    this._defaultKeepAlive = true;
    this.useChunkedEncodingByDefault = true;
    this.sendDate = false;
    this._removedConnection = false;
    this._removedContLen = false;
    this._removedTE = false;
    this.strictContentLength = false;
    this[kBytesWritten] = 0;
    this._contentLength = null;
    this._hasBody = true;
    this._trailer = "";
    this[kNeedDrain] = false;
    this.finished = false;
    this._headerSent = false;
    this[kCorked] = 0;
    this[kChunkedBuffer] = [];
    this[kChunkedLength] = 0;
    this._closed = false;
    this._header = null;
    this[kOutHeaders] = null;
    this._keepAliveTimeout = 0;
    this._onPendingData = nop;
    this[kErrored] = null;
    this[kHighWaterMark] = options?.highWaterMark ?? getDefaultHighWaterMark();
    this[kRejectNonStandardBodyWrites] = options?.rejectNonStandardBodyWrites ?? false;
    this[kUniqueHeaders] = null;
  }
  _renderHeaders() {
    if (this._header) {
      throw new ERR_HTTP_HEADERS_SENT("render");
    }
    const headersMap = this[kOutHeaders];
    const headers = {};
    if (headersMap !== null) {
      const keys = Object.keys(headersMap);
      for (let i2 = 0, l2 = keys.length; i2 < l2; i2++) {
        const key = keys[i2];
        headers[headersMap[key][0]] = headersMap[key][1];
      }
    }
    return headers;
  }
  cork() {
    this[kCorked]++;
    if (this._writtenDataBuffer != null) {
      this._writtenDataBuffer.cork();
    }
  }
  uncork() {
    this[kCorked]--;
    if (this._writtenDataBuffer != null) {
      this._writtenDataBuffer.uncork();
    }
    if (this[kCorked] || this[kChunkedBuffer].length === 0) {
      return;
    }
    const buf = this[kChunkedBuffer];
    for (const { data, encoding, callback } of buf) {
      this._send(data ?? "", encoding, callback);
    }
    this[kChunkedBuffer].length = 0;
    this[kChunkedLength] = 0;
  }
  setTimeout(msecs, callback) {
    return this;
  }
  destroy(error) {
    if (this.destroyed) {
      return this;
    }
    this.destroyed = true;
    this[kErrored] = error;
    return this;
  }
  _send(data, encoding, callback, byteLength) {
    if (!this._headerSent) {
      const header = this._header;
      if (typeof data === "string" && (encoding === "utf8" || encoding === "latin1" || !encoding)) {
        data = header + data;
      } else {
        this.outputData.unshift({
          data: header,
          encoding: "latin1",
          callback: void 0
        });
        this.outputSize += header.length;
        this._onPendingData(header.length);
      }
      this._headerSent = true;
      this.writtenHeaderBytes = header.length;
      const [statusLine, ...headerLines] = this._header.split("\r\n");
      const STATUS_LINE_REGEXP = /^HTTP\/1\.1 (?<statusCode>\d+) (?<statusMessage>.*)$/;
      const statusLineResult = STATUS_LINE_REGEXP.exec(statusLine);
      if (statusLineResult == null) {
        throw new Error("Unexpected! Status line was " + statusLine);
      }
      const { statusCode: statusCodeText, statusMessage } = statusLineResult.groups ?? {};
      const statusCode = parseInt(statusCodeText, 10);
      const headers = [];
      for (const headerLine of headerLines) {
        if (headerLine !== "") {
          const pos = headerLine.indexOf(": ");
          const k = headerLine.slice(0, pos);
          const v = headerLine.slice(pos + 2);
          headers.push([k, v]);
        }
      }
      const event = {
        statusCode,
        statusMessage,
        headers
      };
      this.emit("_headersSent", event);
    }
    return this._writeRaw(data, encoding, callback, byteLength);
  }
  _writeRaw(data, encoding, callback, size) {
    if (typeof encoding === "function") {
      callback = encoding;
      encoding = null;
    }
    if (this._writtenDataBuffer != null) {
      if (this.outputData.length) {
        this._flushOutput(this._writtenDataBuffer);
      }
      return this._writtenDataBuffer.write(data, encoding, callback);
    }
    this.outputData.push({ data, encoding, callback });
    this.outputSize += data.length;
    this._onPendingData(data.length);
    return this.outputSize < this[kHighWaterMark];
  }
  _onDataWritten(index, entry) {
    const event = { index, entry };
    this.emit("_dataWritten", event);
  }
  _storeHeader(firstLine, headers) {
    const state = {
      connection: false,
      contLen: false,
      te: false,
      date: false,
      expect: false,
      trailer: false,
      header: firstLine
    };
    if (headers) {
      if (headers === this[kOutHeaders]) {
        for (const key in headers) {
          const entry = headers[key];
          processHeader(this, state, entry[0], entry[1], false);
        }
      } else if (Array.isArray(headers)) {
        if (headers.length && Array.isArray(headers[0])) {
          for (let i2 = 0; i2 < headers.length; i2++) {
            const entry = headers[i2];
            processHeader(this, state, entry[0], entry[1], true);
          }
        } else {
          if (headers.length % 2 !== 0) {
            throw new ERR_INVALID_ARG_VALUE("headers", headers);
          }
          for (let n2 = 0; n2 < headers.length; n2 += 2) {
            processHeader(this, state, headers[n2], headers[n2 + 1], true);
          }
        }
      } else {
        for (const key in headers) {
          if (headers.hasOwnProperty(key)) {
            const _headers = headers;
            processHeader(this, state, key, _headers[key], true);
          }
        }
      }
    }
    let { header } = state;
    if (this.sendDate && !state.date) {
      header += "Date: " + utcDate() + "\r\n";
    }
    if (this.chunkedEncoding && (this.statusCode === 204 || this.statusCode === 304)) {
      this.chunkedEncoding = false;
      this.shouldKeepAlive = false;
    }
    if (this._removedConnection) {
      this._last = !this.shouldKeepAlive;
    } else if (!state.connection) {
      const shouldSendKeepAlive = this.shouldKeepAlive && (state.contLen || this.useChunkedEncodingByDefault);
      if (shouldSendKeepAlive && this.maxRequestsOnConnectionReached) {
        header += "Connection: close\r\n";
      } else if (shouldSendKeepAlive) {
        header += "Connection: keep-alive\r\n";
        if (this._keepAliveTimeout && this._defaultKeepAlive) {
          const timeoutSeconds = Math.floor(this._keepAliveTimeout / 1e3);
          let max = "";
          if (this._maxRequestsPerSocket && ~~this._maxRequestsPerSocket > 0) {
            max = `, max=${this._maxRequestsPerSocket}`;
          }
          header += `Keep-Alive: timeout=${timeoutSeconds}${max}\r
`;
        }
      } else {
        this._last = true;
        header += "Connection: close\r\n";
      }
    }
    if (!state.contLen && !state.te) {
      if (!this._hasBody) {
        this.chunkedEncoding = false;
      } else if (!this.useChunkedEncodingByDefault) {
        this._last = true;
      } else if (!state.trailer && !this._removedContLen && typeof this._contentLength === "number") {
        header += "Content-Length: " + this._contentLength + "\r\n";
      } else if (!this._removedTE) {
        header += "Transfer-Encoding: chunked\r\n";
        this.chunkedEncoding = true;
      } else {
        this._last = true;
      }
    }
    if (this.chunkedEncoding !== true && state.trailer) {
      throw new ERR_HTTP_TRAILER_INVALID();
    }
    this._header = header + "\r\n";
    this._headerSent = false;
    if (state.expect) {
      this._send("");
    }
  }
  get _headers() {
    console.warn("DEP0066: OutgoingMessage.prototype._headers is deprecated");
    return this.getHeaders();
  }
  set _headers(val) {
    console.warn("DEP0066: OutgoingMessage.prototype._headers is deprecated");
    if (val == null) {
      this[kOutHeaders] = null;
    } else if (typeof val === "object") {
      const headers = this[kOutHeaders] = /* @__PURE__ */ Object.create(null);
      const keys = Object.keys(val);
      for (let i2 = 0; i2 < keys.length; ++i2) {
        const name = keys[i2];
        headers[name.toLowerCase()] = [name, val[name]];
      }
    }
  }
  get connection() {
    return null;
  }
  set connection(_socket) {
    console.error("No support for OutgoingMessage.connection");
  }
  get socket() {
    return null;
  }
  set socket(_socket) {
    console.error("No support for OutgoingMessage.socket");
  }
  get _headerNames() {
    console.warn("DEP0066: OutgoingMessage.prototype._headerNames is deprecated");
    const headers = this[kOutHeaders];
    if (headers !== null) {
      const out = /* @__PURE__ */ Object.create(null);
      const keys = Object.keys(headers);
      for (let i2 = 0; i2 < keys.length; ++i2) {
        const key = keys[i2];
        const val = headers[key][0];
        out[key] = val;
      }
      return out;
    }
    return null;
  }
  set _headerNames(val) {
    console.warn("DEP0066: OutgoingMessage.prototype._headerNames is deprecated");
    if (typeof val === "object" && val !== null) {
      const headers = this[kOutHeaders];
      if (!headers)
        return;
      const keys = Object.keys(val);
      for (let i2 = 0; i2 < keys.length; ++i2) {
        const header = headers[keys[i2]];
        if (header)
          header[0] = val[keys[i2]];
      }
    }
  }
  setHeader(name, value) {
    if (this._header) {
      throw new ERR_HTTP_HEADERS_SENT("set");
    }
    validateHeaderName(name);
    validateHeaderValue(name, value);
    let headers = this[kOutHeaders];
    if (headers === null) {
      this[kOutHeaders] = headers = { __proto__: null };
    }
    headers[name.toLowerCase()] = [name, value];
    return this;
  }
  setHeaders(headers) {
    if (this._header) {
      throw new ERR_HTTP_HEADERS_SENT("set");
    }
    if (!headers || Array.isArray(headers) || typeof headers.keys !== "function" || typeof headers.get !== "function") {
      throw new ERR_INVALID_ARG_TYPE("headers", ["Headers", "Map"], headers);
    }
    const cookies = [];
    for (const { 0: key, 1: value } of headers) {
      if (key === "set-cookie") {
        if (Array.isArray(value)) {
          cookies.push(...value);
        } else {
          cookies.push(value);
        }
        continue;
      }
      this.setHeader(key, value);
    }
    if (cookies.length) {
      this.setHeader("set-cookie", cookies);
    }
    return this;
  }
  appendHeader(name, value) {
    if (this._header) {
      throw new ERR_HTTP_HEADERS_SENT("append");
    }
    validateHeaderName(name);
    validateHeaderValue(name, value);
    const field = name.toLowerCase();
    const headers = this[kOutHeaders];
    if (headers === null || !headers[field]) {
      return this.setHeader(name, value);
    }
    if (!Array.isArray(headers[field][1])) {
      headers[field][1] = [headers[field][1]];
    }
    const existingValues = headers[field][1];
    if (Array.isArray(value)) {
      for (let i2 = 0, length = value.length; i2 < length; i2++) {
        existingValues.push(value[i2]);
      }
    } else {
      existingValues.push(value);
    }
    return this;
  }
  getHeader(name) {
    validateString(name, "name");
    const headers = this[kOutHeaders];
    if (headers === null) {
      return;
    }
    const entry = headers[name.toLowerCase()];
    return entry?.[1];
  }
  getHeaderNames() {
    return this[kOutHeaders] !== null ? Object.keys(this[kOutHeaders]) : [];
  }
  getRawHeaderNames() {
    const headersMap = this[kOutHeaders];
    if (headersMap === null)
      return [];
    const values = Object.values(headersMap);
    const headers = Array(values.length);
    for (let i2 = 0, l2 = values.length; i2 < l2; i2++) {
      headers[i2] = values[i2][0];
    }
    return headers;
  }
  getHeaders() {
    const headers = this[kOutHeaders];
    const ret = { __proto__: null };
    if (headers) {
      const keys = Object.keys(headers);
      for (let i2 = 0; i2 < keys.length; ++i2) {
        const key = keys[i2];
        const val = headers[key][1];
        ret[key] = val;
      }
    }
    return ret;
  }
  hasHeader(name) {
    validateString(name, "name");
    return this[kOutHeaders] !== null && !!this[kOutHeaders][name.toLowerCase()];
  }
  removeHeader(name) {
    validateString(name, "name");
    if (this._header) {
      throw new ERR_HTTP_HEADERS_SENT("remove");
    }
    const key = name.toLowerCase();
    switch (key) {
      case "connection":
        this._removedConnection = true;
        break;
      case "content-length":
        this._removedContLen = true;
        break;
      case "transfer-encoding":
        this._removedTE = true;
        break;
      case "date":
        this.sendDate = false;
        break;
    }
    if (this[kOutHeaders] !== null) {
      delete this[kOutHeaders][key];
    }
  }
  _implicitHeader() {
    throw new ERR_METHOD_NOT_IMPLEMENTED("_implicitHeader()");
  }
  get headersSent() {
    return !!this._header;
  }
  write(chunk, encoding, callback) {
    if (typeof encoding === "function") {
      callback = encoding;
      encoding = null;
    }
    const ret = write_(this, chunk, encoding, callback, false);
    if (!ret) {
      this[kNeedDrain] = true;
    }
    return ret;
  }
  addTrailers(headers) {
    this._trailer = "";
    const isArray = Array.isArray(headers);
    const keys = isArray ? [...headers.keys()] : Object.keys(headers);
    for (let i2 = 0, l2 = keys.length; i2 < l2; i2++) {
      let field, value;
      if (isArray) {
        const _headers = headers;
        const key = keys[i2];
        field = _headers[key][0];
        value = _headers[key][1];
      } else {
        const _headers = headers;
        const key = keys[i2];
        field = key;
        value = _headers[key];
      }
      validateHeaderName(field, "Trailer name");
      if (Array.isArray(value) && value.length > 1 && (!this[kUniqueHeaders] || !this[kUniqueHeaders].has(field.toLowerCase()))) {
        for (let j = 0, l3 = value.length; j < l3; j++) {
          if (checkInvalidHeaderChar(value[j])) {
            throw new ERR_INVALID_CHAR("trailer content", field);
          }
          this._trailer += field + ": " + value[j] + "\r\n";
        }
      } else {
        if (Array.isArray(value)) {
          value = value.join("; ");
        }
        if (checkInvalidHeaderChar(String(value))) {
          throw new ERR_INVALID_CHAR("trailer content", field);
        }
        this._trailer += field + ": " + value + "\r\n";
      }
    }
  }
  end(chunk, encoding, callback) {
    if (typeof chunk === "function") {
      callback = chunk;
      chunk = null;
      encoding = null;
    } else if (typeof encoding === "function") {
      callback = encoding;
      encoding = null;
    }
    if (chunk) {
      if (this.finished) {
        onError2(this, new ERR_STREAM_WRITE_AFTER_END(), typeof callback !== "function" ? nop : callback);
        return this;
      }
      if (this._writtenDataBuffer != null) {
        this._writtenDataBuffer.cork();
      }
      write_(this, chunk, encoding, null, true);
    } else if (this.finished) {
      if (typeof callback === "function") {
        if (!this.writableFinished) {
          this.on("finish", callback);
        } else {
          callback(new ERR_STREAM_ALREADY_FINISHED("end"));
        }
      }
      return this;
    } else if (!this._header) {
      if (this._writtenDataBuffer != null) {
        this._writtenDataBuffer.cork();
      }
      this._contentLength = 0;
      this._implicitHeader();
    }
    if (typeof callback === "function")
      this.once("finish", callback);
    if (strictContentLength(this) && this[kBytesWritten] !== this._contentLength) {
      throw new ERR_HTTP_CONTENT_LENGTH_MISMATCH(this[kBytesWritten], this._contentLength);
    }
    const finish = onFinish.bind(void 0, this);
    if (this._hasBody && this.chunkedEncoding) {
      this._send("", "latin1", finish);
    } else if (!this._headerSent || this.writableLength || chunk) {
      this._send("", "latin1", finish);
    } else {
      setTimeout(finish, 0);
    }
    if (this._writtenDataBuffer != null) {
      this._writtenDataBuffer.uncork();
    }
    this[kCorked] = 1;
    this.uncork();
    this.finished = true;
    if (this.outputData.length === 0 && this._writtenDataBuffer != null) {
      this._finish();
    }
    return this;
  }
  _finish() {
    this.emit("prefinish");
  }
  // No _flush() implementation?
  _flush() {
    if (this._writtenDataBuffer != null) {
      const ret = this._flushOutput(this._writtenDataBuffer);
      if (this.finished) {
        this._finish();
      } else if (ret && this[kNeedDrain]) {
        this[kNeedDrain] = false;
        this.emit("drain");
      }
    }
  }
  _flushOutput(dataBuffer) {
    while (this[kCorked]) {
      this[kCorked]--;
      dataBuffer.cork();
    }
    const outputLength = this.outputData.length;
    if (outputLength <= 0) {
      return void 0;
    }
    const outputData = this.outputData;
    dataBuffer.cork();
    let ret;
    for (let i2 = 0; i2 < outputLength; i2++) {
      const { data, encoding, callback } = outputData[i2];
      outputData[i2].data = null;
      ret = dataBuffer.write(data ?? "", encoding, callback);
    }
    dataBuffer.uncork();
    this.outputData = [];
    this._onPendingData(-this.outputSize);
    this.outputSize = 0;
    return ret;
  }
  flushHeaders() {
    if (!this._header) {
      this._implicitHeader();
    }
    this._send("");
  }
  pipe(destination) {
    this.emit("error", new ERR_STREAM_CANNOT_PIPE());
    return destination;
  }
};
function processHeader(self, state, key, value, validate) {
  if (validate) {
    validateHeaderName(key);
  }
  if (isContentDispositionField(key) && self._contentLength) {
    if (Array.isArray(value)) {
      for (let i2 = 0; i2 < value.length; i2++) {
        value[i2] = String(Buffer$1.from(String(value[i2]), "latin1"));
      }
    } else {
      value = String(Buffer$1.from(String(value), "latin1"));
    }
  }
  if (Array.isArray(value)) {
    if ((value.length < 2 || !isCookieField(key)) && (!self[kUniqueHeaders] || !self[kUniqueHeaders].has(key.toLowerCase()))) {
      for (let i2 = 0; i2 < value.length; i2++) {
        storeHeader(self, state, key, value[i2], validate);
      }
      return;
    }
    value = value.join("; ");
  }
  storeHeader(self, state, key, String(value), validate);
}
function storeHeader(self, state, key, value, validate) {
  if (validate) {
    validateHeaderValue(key, value);
  }
  state.header += key + ": " + value + "\r\n";
  matchHeader(self, state, key, value);
}
function validateHeaderName(name, label) {
  if (typeof name !== "string" || !name || !checkIsHttpToken(name)) {
    throw new ERR_INVALID_HTTP_TOKEN(label || "Header name", name);
  }
}
function validateHeaderValue(name, value) {
  if (value === void 0) {
    throw new ERR_HTTP_INVALID_HEADER_VALUE(String(value), name);
  }
  if (checkInvalidHeaderChar(String(value))) {
    throw new ERR_INVALID_CHAR("header content", name);
  }
}
function matchHeader(self, state, field, value) {
  if (field.length < 4 || field.length > 17)
    return;
  field = field.toLowerCase();
  switch (field) {
    case "connection":
      state.connection = true;
      self._removedConnection = false;
      if (RE_CONN_CLOSE.exec(value) !== null)
        self._last = true;
      else
        self.shouldKeepAlive = true;
      break;
    case "transfer-encoding":
      state.te = true;
      self._removedTE = false;
      if (chunkExpression.exec(value) !== null)
        self.chunkedEncoding = true;
      break;
    case "content-length":
      state.contLen = true;
      self._contentLength = +value;
      self._removedContLen = false;
      break;
    case "date":
    case "expect":
    case "trailer":
      state[field] = true;
      break;
    case "keep-alive":
      self._defaultKeepAlive = false;
      break;
  }
}
function onError2(msg, err, callback) {
  if (msg.destroyed) {
    return;
  }
  setTimeout(emitErrorNt, 0, msg, err, callback);
}
function emitErrorNt(msg, err, callback) {
  callback(err);
  if (typeof msg.emit === "function" && !msg.destroyed) {
    msg.emit("error", err);
  }
}
function strictContentLength(msg) {
  return msg.strictContentLength && msg._contentLength != null && msg._hasBody && !msg._removedContLen && !msg.chunkedEncoding && !msg.hasHeader("transfer-encoding");
}
function write_(msg, chunk, encoding, callback, fromEnd) {
  if (typeof callback !== "function") {
    callback = nop;
  }
  if (chunk === null) {
    throw new ERR_STREAM_NULL_VALUES();
  } else if (typeof chunk !== "string" && !isUint8Array(chunk)) {
    throw new ERR_INVALID_ARG_TYPE("chunk", ["string", "Buffer", "Uint8Array"], chunk);
  }
  let err = void 0;
  if (msg.finished) {
    err = new ERR_STREAM_WRITE_AFTER_END();
  } else if (msg.destroyed) {
    err = new ERR_STREAM_DESTROYED("write");
  }
  if (err) {
    if (!msg.destroyed) {
      onError2(msg, err, callback);
    } else {
      setTimeout(callback, 0, err);
    }
    return false;
  }
  let len = void 0;
  if (msg.strictContentLength) {
    len ??= typeof chunk === "string" ? Buffer$1.byteLength(chunk, encoding ?? void 0) : chunk.byteLength;
    if (strictContentLength(msg) && (fromEnd ? msg[kBytesWritten] + len !== msg._contentLength : msg[kBytesWritten] + len > (msg._contentLength ?? 0))) {
      throw new ERR_HTTP_CONTENT_LENGTH_MISMATCH(len + msg[kBytesWritten], msg._contentLength);
    }
    msg[kBytesWritten] += len;
  }
  if (!msg._header) {
    if (fromEnd) {
      len ??= typeof chunk === "string" ? Buffer$1.byteLength(chunk, encoding ?? void 0) : chunk.byteLength;
      msg._contentLength = len;
    }
    msg._implicitHeader();
  }
  if (!msg._hasBody) {
    if (msg[kRejectNonStandardBodyWrites]) {
      throw new ERR_HTTP_BODY_NOT_ALLOWED();
    } else {
      setTimeout(callback, 0);
      return true;
    }
  }
  if (!fromEnd && msg._writtenDataBuffer != null && !msg._writtenDataBuffer.writableCorked) {
    msg._writtenDataBuffer.cork();
    setTimeout(connectionCorkNT, 0, msg._writtenDataBuffer);
  }
  let ret;
  if (msg.chunkedEncoding && chunk.length !== 0) {
    len ??= typeof chunk === "string" ? Buffer$1.byteLength(chunk, encoding ?? void 0) : chunk.byteLength;
    if (msg[kCorked] && msg._headerSent) {
      msg[kChunkedBuffer].push({ data: chunk, encoding, callback });
      msg[kChunkedLength] += len;
      ret = msg[kChunkedLength] < msg[kHighWaterMark];
    } else {
      ret = msg._send(chunk, encoding, callback, len);
    }
  } else {
    ret = msg._send(chunk, encoding, callback, len);
  }
  return ret;
}
function connectionCorkNT(dataBuffer) {
  dataBuffer.uncork();
}
function onFinish(outmsg) {
  outmsg.emit("finish");
}
Object.defineProperties(FetchOutgoingMessage.prototype, {
  errored: {
    get() {
      return this[kErrored];
    }
  },
  closed: {
    get() {
      return this._closed;
    }
  },
  writableFinished: {
    get() {
      return this.finished && this.outputSize === 0 && (this._writtenDataBuffer == null || this._writtenDataBuffer.writableLength === 0);
    }
  },
  writableObjectMode: {
    get() {
      return false;
    }
  },
  writableLength: {
    get() {
      return this.outputSize + this[kChunkedLength] + (this._writtenDataBuffer != null ? this._writtenDataBuffer.writableLength : 0);
    }
  },
  writableHighWaterMark: {
    get() {
      return this._writtenDataBuffer != null ? this._writtenDataBuffer.writableHighWaterMark : this[kHighWaterMark];
    }
  },
  writableCorked: {
    get() {
      return this[kCorked];
    }
  },
  writableEnded: {
    get() {
      return this.finished;
    }
  },
  writableNeedDrain: {
    get() {
      return !this.destroyed && !this.finished && this[kNeedDrain];
    }
  }
});
var headerCharRegex2 = /[^\t\x20-\x7e\x80-\xff]/;
function checkInvalidHeaderChar2(val) {
  return headerCharRegex2.test(val);
}
var STATUS_CODES = {
  100: "Continue",
  // RFC 7231 6.2.1
  101: "Switching Protocols",
  // RFC 7231 6.2.2
  102: "Processing",
  // RFC 2518 10.1 (obsoleted by RFC 4918)
  103: "Early Hints",
  // RFC 8297 2
  200: "OK",
  // RFC 7231 6.3.1
  201: "Created",
  // RFC 7231 6.3.2
  202: "Accepted",
  // RFC 7231 6.3.3
  203: "Non-Authoritative Information",
  // RFC 7231 6.3.4
  204: "No Content",
  // RFC 7231 6.3.5
  205: "Reset Content",
  // RFC 7231 6.3.6
  206: "Partial Content",
  // RFC 7233 4.1
  207: "Multi-Status",
  // RFC 4918 11.1
  208: "Already Reported",
  // RFC 5842 7.1
  226: "IM Used",
  // RFC 3229 10.4.1
  300: "Multiple Choices",
  // RFC 7231 6.4.1
  301: "Moved Permanently",
  // RFC 7231 6.4.2
  302: "Found",
  // RFC 7231 6.4.3
  303: "See Other",
  // RFC 7231 6.4.4
  304: "Not Modified",
  // RFC 7232 4.1
  305: "Use Proxy",
  // RFC 7231 6.4.5
  307: "Temporary Redirect",
  // RFC 7231 6.4.7
  308: "Permanent Redirect",
  // RFC 7238 3
  400: "Bad Request",
  // RFC 7231 6.5.1
  401: "Unauthorized",
  // RFC 7235 3.1
  402: "Payment Required",
  // RFC 7231 6.5.2
  403: "Forbidden",
  // RFC 7231 6.5.3
  404: "Not Found",
  // RFC 7231 6.5.4
  405: "Method Not Allowed",
  // RFC 7231 6.5.5
  406: "Not Acceptable",
  // RFC 7231 6.5.6
  407: "Proxy Authentication Required",
  // RFC 7235 3.2
  408: "Request Timeout",
  // RFC 7231 6.5.7
  409: "Conflict",
  // RFC 7231 6.5.8
  410: "Gone",
  // RFC 7231 6.5.9
  411: "Length Required",
  // RFC 7231 6.5.10
  412: "Precondition Failed",
  // RFC 7232 4.2
  413: "Payload Too Large",
  // RFC 7231 6.5.11
  414: "URI Too Long",
  // RFC 7231 6.5.12
  415: "Unsupported Media Type",
  // RFC 7231 6.5.13
  416: "Range Not Satisfiable",
  // RFC 7233 4.4
  417: "Expectation Failed",
  // RFC 7231 6.5.14
  418: "I'm a Teapot",
  // RFC 7168 2.3.3
  421: "Misdirected Request",
  // RFC 7540 9.1.2
  422: "Unprocessable Entity",
  // RFC 4918 11.2
  423: "Locked",
  // RFC 4918 11.3
  424: "Failed Dependency",
  // RFC 4918 11.4
  425: "Too Early",
  // RFC 8470 5.2
  426: "Upgrade Required",
  // RFC 2817 and RFC 7231 6.5.15
  428: "Precondition Required",
  // RFC 6585 3
  429: "Too Many Requests",
  // RFC 6585 4
  431: "Request Header Fields Too Large",
  // RFC 6585 5
  451: "Unavailable For Legal Reasons",
  // RFC 7725 3
  500: "Internal Server Error",
  // RFC 7231 6.6.1
  501: "Not Implemented",
  // RFC 7231 6.6.2
  502: "Bad Gateway",
  // RFC 7231 6.6.3
  503: "Service Unavailable",
  // RFC 7231 6.6.4
  504: "Gateway Timeout",
  // RFC 7231 6.6.5
  505: "HTTP Version Not Supported",
  // RFC 7231 6.6.6
  506: "Variant Also Negotiates",
  // RFC 2295 8.1
  507: "Insufficient Storage",
  // RFC 4918 11.5
  508: "Loop Detected",
  // RFC 5842 7.2
  509: "Bandwidth Limit Exceeded",
  510: "Not Extended",
  // RFC 2774 7
  511: "Network Authentication Required"
  // RFC 6585 6
};
var FetchServerResponse = class _FetchServerResponse extends FetchOutgoingMessage {
  static encoder = new TextEncoder();
  statusCode = 200;
  statusMessage;
  _sent100;
  _expect_continue;
  [kOutHeaders] = null;
  constructor(req, options) {
    super(req, options);
    if (req.method === "HEAD") {
      this._hasBody = false;
    }
    this.sendDate = true;
    this._sent100 = false;
    this._expect_continue = false;
    if (req.httpVersionMajor < 1 || req.httpVersionMinor < 1) {
      this.useChunkedEncodingByDefault = chunkExpression.exec(String(req.headers.te)) !== null;
      this.shouldKeepAlive = false;
    }
    this.fetchResponse = new Promise((resolve) => {
      let finished = false;
      this.on("finish", () => {
        finished = true;
      });
      const initialDataChunks = [];
      const initialDataWrittenHandler = (e2) => {
        if (finished) {
          return;
        }
        initialDataChunks[e2.index] = this.dataFromDataWrittenEvent(e2);
      };
      this.on("_dataWritten", initialDataWrittenHandler);
      this.on("_headersSent", (e2) => {
        this.off("_dataWritten", initialDataWrittenHandler);
        const { statusCode, statusMessage, headers } = e2;
        resolve(this._toFetchResponse(statusCode, statusMessage, headers, initialDataChunks, finished));
      });
    });
  }
  dataFromDataWrittenEvent(e2) {
    const { index, entry } = e2;
    let { data, encoding } = entry;
    if (index === 0) {
      if (typeof data !== "string") {
        console.error("First chunk should be string, not sure what happened.");
        throw new ERR_INVALID_ARG_TYPE("packet.data", ["string", "Buffer", "Uint8Array"], data);
      }
      data = data.slice(this.writtenHeaderBytes);
    }
    if (typeof data === "string") {
      if (encoding === void 0 || encoding === "utf8" || encoding === "utf-8") {
        data = _FetchServerResponse.encoder.encode(data);
      } else {
        data = Buffer$1.from(data, encoding ?? void 0);
      }
    }
    return data ?? Buffer$1.from([]);
  }
  _finish() {
    super._finish();
  }
  assignSocket(socket) {
    throw new ERR_METHOD_NOT_IMPLEMENTED("assignSocket");
  }
  detachSocket(socket) {
    throw new ERR_METHOD_NOT_IMPLEMENTED("detachSocket");
  }
  writeContinue(callback) {
    this._writeRaw("HTTP/1.1 100 Continue\r\n\r\n", "ascii", callback);
    this._sent100 = true;
  }
  writeProcessing(callback) {
    this._writeRaw("HTTP/1.1 102 Processing\r\n\r\n", "ascii", callback);
  }
  writeEarlyHints(hints, callback) {
    let head = "HTTP/1.1 103 Early Hints\r\n";
    if (hints.link === null || hints.link === void 0) {
      return;
    }
    const link = validateLinkHeaderValue(hints.link);
    if (link.length === 0) {
      return;
    }
    head += "Link: " + link + "\r\n";
    for (const key of Object.keys(hints)) {
      if (key !== "link") {
        head += key + ": " + hints[key] + "\r\n";
      }
    }
    head += "\r\n";
    this._writeRaw(head, "ascii", callback);
  }
  _implicitHeader() {
    this.writeHead(this.statusCode);
  }
  writeHead(statusCode, reason, obj) {
    if (this._header) {
      throw new ERR_HTTP_HEADERS_SENT("write");
    }
    const originalStatusCode = statusCode;
    statusCode |= 0;
    if (statusCode < 100 || statusCode > 999) {
      throw new ERR_HTTP_INVALID_STATUS_CODE(originalStatusCode);
    }
    if (typeof reason === "string") {
      this.statusMessage = reason;
    } else {
      this.statusMessage ||= STATUS_CODES[statusCode] || "unknown";
      obj ??= reason;
    }
    this.statusCode = statusCode;
    let headers;
    if (this[kOutHeaders]) {
      let k;
      if (Array.isArray(obj)) {
        if (obj.length % 2 !== 0) {
          throw new ERR_INVALID_ARG_VALUE("headers", obj);
        }
        for (let n2 = 0; n2 < obj.length; n2 += 2) {
          k = obj[n2 + 0];
          this.removeHeader(String(k));
        }
        for (let n2 = 0; n2 < obj.length; n2 += 2) {
          k = obj[n2];
          if (k) {
            this.appendHeader(String(k), obj[n2 + 1]);
          }
        }
      } else if (obj) {
        const keys = Object.keys(obj);
        for (let i2 = 0; i2 < keys.length; i2++) {
          k = keys[i2];
          if (k) {
            this.setHeader(k, obj[k]);
          }
        }
      }
      headers = this[kOutHeaders];
    } else {
      headers = obj;
    }
    if (checkInvalidHeaderChar2(this.statusMessage)) {
      throw new ERR_INVALID_CHAR("statusMessage");
    }
    const statusLine = `HTTP/1.1 ${statusCode} ${this.statusMessage}\r
`;
    if (statusCode === 204 || statusCode === 304 || statusCode >= 100 && statusCode <= 199) {
      this._hasBody = false;
    }
    if (this._expect_continue && !this._sent100) {
      this.shouldKeepAlive = false;
    }
    const convertedHeaders = headers && !Array.isArray(headers) ? headers : headers;
    this._storeHeader(statusLine, convertedHeaders ?? null);
    return this;
  }
  // Docs-only deprecated: DEP0063
  writeHeader = this.writeHead;
  fetchResponse;
  _toFetchResponse(status, statusText, sentHeaders, initialDataChunks, finished) {
    const headers = new Headers();
    for (const [header, value] of sentHeaders) {
      headers.append(header, value);
    }
    const _this = this;
    let body = this._hasBody ? new ReadableStream({
      start(controller) {
        for (const dataChunk of initialDataChunks) {
          controller.enqueue(dataChunk);
        }
        if (finished) {
          controller.close();
        } else {
          _this.on("finish", () => {
            finished = true;
            controller.close();
          });
          _this.on("_dataWritten", (e2) => {
            if (finished) {
              return;
            }
            const data = _this.dataFromDataWrittenEvent(e2);
            controller.enqueue(data);
          });
        }
      }
    }) : null;
    if (body != null && typeof FixedLengthStream !== "undefined") {
      const contentLength = parseInt(headers.get("content-length") ?? "", 10);
      if (contentLength >= 0) {
        body = body.pipeThrough(new FixedLengthStream(contentLength));
      }
    }
    return new Response(body, {
      status,
      statusText,
      headers
    });
  }
};
function toReqRes(req, options) {
  const { createIncomingMessage = () => new FetchIncomingMessage(), createServerResponse = (incoming2) => new FetchServerResponse(incoming2), ctx } = {};
  const incoming = createIncomingMessage(ctx);
  const serverResponse = createServerResponse(incoming, ctx);
  const reqUrl = new URL(req.url);
  const versionMajor = 1;
  const versionMinor = 1;
  incoming.httpVersionMajor = versionMajor;
  incoming.httpVersionMinor = versionMinor;
  incoming.httpVersion = `${versionMajor}.${versionMinor}`;
  incoming.url = reqUrl.pathname + reqUrl.search;
  incoming.upgrade = false;
  const headers = [];
  for (const [headerName, headerValue] of req.headers) {
    headers.push(headerName);
    headers.push(headerValue);
  }
  incoming._addHeaderLines(headers, headers.length);
  incoming.method = req.method;
  incoming._stream = req.body;
  return {
    req: incoming,
    res: serverResponse
  };
}
function toFetchResponse(res) {
  if (!(res instanceof FetchServerResponse)) {
    throw new Error("toFetchResponse must be called on a ServerResponse generated by toReqRes");
  }
  return res.fetchResponse;
}

// src/server/handlers/mcp.ts
var getMastra = (c2) => c2.get("mastra");
var getMcpServerMessageHandler = async (c2) => {
  const mastra = getMastra(c2);
  const serverId = c2.req.param("serverId");
  const { req, res } = toReqRes(c2.req.raw);
  const server = mastra.getMCPServer(serverId);
  if (!server) {
    return c2.json({ error: `MCP server '${serverId}' not found` }, 404);
  }
  try {
    await server.startHTTP({
      url: new URL(c2.req.url),
      httpPath: `/api/servers/${serverId}/mcp`,
      req,
      res,
      options: {
        sessionIdGenerator: void 0
      }
    });
    const toFetchRes = await toFetchResponse(res);
    return toFetchRes;
  } catch (error) {
    return handleError(error, "Error sending MCP message");
  }
};
var getMcpServerSseHandler = async (c2) => {
  const mastra = getMastra(c2);
  const serverId = c2.req.param("serverId");
  const server = mastra.getMCPServer(serverId);
  if (!server) {
    return c2.json({ error: `MCP server '${serverId}' not found` }, 404);
  }
  const requestUrl = new URL(c2.req.url);
  const sseConnectionPath = `/api/servers/${serverId}/sse`;
  const sseMessagePath = `/api/servers/${serverId}/messages`;
  try {
    return await server.startHonoSSE({
      url: requestUrl,
      ssePath: sseConnectionPath,
      messagePath: sseMessagePath,
      context: c2
    });
  } catch (error) {
    c2.get("logger")?.error({ err: error, serverId, path: requestUrl.pathname }, "Error in MCP SSE route handler");
    return handleError(error, "Error handling MCP SSE request");
  }
};
async function getMemoryStatusHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const agentId = c2.req.query("agentId");
    const result = await getMemoryStatusHandler$1({
      mastra,
      agentId
    });
    return c2.json(result);
  } catch (error) {
    return handleError(error, "Error getting memory status");
  }
}
async function getThreadsHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const agentId = c2.req.query("agentId");
    const resourceId = c2.req.query("resourceid");
    const result = await getThreadsHandler$1({
      mastra,
      agentId,
      resourceId
    });
    return c2.json(result);
  } catch (error) {
    return handleError(error, "Error getting threads");
  }
}
async function getThreadByIdHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const agentId = c2.req.query("agentId");
    const threadId = c2.req.param("threadId");
    const result = await getThreadByIdHandler$1({
      mastra,
      agentId,
      threadId
    });
    return c2.json(result);
  } catch (error) {
    return handleError(error, "Error getting thread");
  }
}
async function saveMessagesHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const agentId = c2.req.query("agentId");
    const body = await c2.req.json();
    const result = await saveMessagesHandler$1({
      mastra,
      agentId,
      body
    });
    return c2.json(result);
  } catch (error) {
    return handleError(error, "Error saving messages");
  }
}
async function createThreadHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const agentId = c2.req.query("agentId");
    const body = await c2.req.json();
    const result = await createThreadHandler$1({
      mastra,
      agentId,
      body
    });
    return c2.json(result);
  } catch (error) {
    return handleError(error, "Error saving thread to memory");
  }
}
async function updateThreadHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const agentId = c2.req.query("agentId");
    const threadId = c2.req.param("threadId");
    const body = await c2.req.json();
    const result = await updateThreadHandler$1({
      mastra,
      agentId,
      threadId,
      body
    });
    return c2.json(result);
  } catch (error) {
    return handleError(error, "Error updating thread");
  }
}
async function deleteThreadHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const agentId = c2.req.query("agentId");
    const threadId = c2.req.param("threadId");
    const result = await deleteThreadHandler$1({
      mastra,
      agentId,
      threadId
    });
    return c2.json(result);
  } catch (error) {
    return handleError(error, "Error deleting thread");
  }
}
async function getMessagesHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const agentId = c2.req.query("agentId");
    const threadId = c2.req.param("threadId");
    const rawLimit = c2.req.query("limit");
    let limit = void 0;
    if (rawLimit !== void 0) {
      const n2 = Number(rawLimit);
      if (Number.isFinite(n2) && Number.isInteger(n2) && n2 > 0) {
        limit = n2;
      }
    }
    const result = await getMessagesHandler$1({
      mastra,
      agentId,
      threadId,
      limit
    });
    return c2.json(result);
  } catch (error) {
    return handleError(error, "Error getting messages");
  }
}
async function getNetworksHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const runtimeContext = c2.get("runtimeContext");
    const networks = await getNetworksHandler$1({
      mastra,
      runtimeContext
    });
    return c2.json(networks);
  } catch (error) {
    return handleError(error, "Error getting networks");
  }
}
async function getNetworkByIdHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const networkId = c2.req.param("networkId");
    const runtimeContext = c2.get("runtimeContext");
    const network = await getNetworkByIdHandler$1({
      mastra,
      networkId,
      runtimeContext
    });
    return c2.json(network);
  } catch (error) {
    return handleError(error, "Error getting network by ID");
  }
}
async function generateHandler2(c2) {
  try {
    const mastra = c2.get("mastra");
    const runtimeContext = c2.get("runtimeContext");
    const networkId = c2.req.param("networkId");
    const body = await c2.req.json();
    const result = await generateHandler$1({
      mastra,
      runtimeContext,
      networkId,
      body
    });
    return c2.json(result);
  } catch (error) {
    return handleError(error, "Error generating from network");
  }
}
async function streamGenerateHandler2(c2) {
  try {
    const mastra = c2.get("mastra");
    const runtimeContext = c2.get("runtimeContext");
    const networkId = c2.req.param("networkId");
    const body = await c2.req.json();
    const streamResponse = await streamGenerateHandler$1({
      mastra,
      runtimeContext,
      networkId,
      body
    });
    return streamResponse;
  } catch (error) {
    return handleError(error, "Error streaming from network");
  }
}
async function generateSystemPromptHandler(c2) {
  try {
    const agentId = c2.req.param("agentId");
    const isPlayground = c2.get("playground") === true;
    if (!isPlayground) {
      return c2.json({ error: "This API is only available in the playground environment" }, 403);
    }
    const { instructions, comment } = await c2.req.json();
    if (!instructions) {
      return c2.json({ error: "Missing instructions in request body" }, 400);
    }
    const mastra = c2.get("mastra");
    const agent = mastra.getAgent(agentId);
    if (!agent) {
      return c2.json({ error: "Agent not found" }, 404);
    }
    let evalSummary = "";
    try {
      const testEvals = await mastra.getStorage()?.getEvalsByAgentName?.(agent.name, "test") || [];
      const liveEvals = await mastra.getStorage()?.getEvalsByAgentName?.(agent.name, "live") || [];
      const evalsMapped = [...testEvals, ...liveEvals].filter(
        ({ instructions: evalInstructions }) => evalInstructions === instructions
      );
      evalSummary = evalsMapped.map(
        ({ input, output, result: result2 }) => `
          Input: ${input}

          Output: ${output}

          Result: ${JSON.stringify(result2)}

        `
      ).join("");
    } catch (error) {
      mastra.getLogger().error(`Error fetching evals`, { error });
    }
    const ENHANCE_SYSTEM_PROMPT_INSTRUCTIONS = `
            You are an expert system prompt engineer, specialized in analyzing and enhancing instructions to create clear, effective, and comprehensive system prompts. Your goal is to help users transform their basic instructions into well-structured system prompts that will guide AI behavior effectively.
            Follow these steps to analyze and enhance the instructions:
            1. ANALYSIS PHASE
            - Identify the core purpose and goals
            - Extract key constraints and requirements
            - Recognize domain-specific terminology and concepts
            - Note any implicit assumptions that should be made explicit
            2. PROMPT STRUCTURE
            Create a system prompt with these components:
            a) ROLE DEFINITION
                - Clear statement of the AI's role and purpose
                - Key responsibilities and scope
                - Primary stakeholders and users
            b) CORE CAPABILITIES
                - Main functions and abilities
                - Specific domain knowledge required
                - Tools and resources available
            c) BEHAVIORAL GUIDELINES
                - Communication style and tone
                - Decision-making framework
                - Error handling approach
                - Ethical considerations
            d) CONSTRAINTS & BOUNDARIES
                - Explicit limitations
                - Out-of-scope activities
                - Security and privacy considerations
            e) SUCCESS CRITERIA
                - Quality standards
                - Expected outcomes
                - Performance metrics
            3. QUALITY CHECKS
            Ensure the prompt is:
            - Clear and unambiguous
            - Comprehensive yet concise
            - Properly scoped
            - Technically accurate
            - Ethically sound
            4. OUTPUT FORMAT
            Return a structured response with:
            - Enhanced system prompt
            - Analysis of key components
            - Identified goals and constraints
            - Core domain concepts
            Remember: A good system prompt should be specific enough to guide behavior but flexible enough to handle edge cases. 
            Focus on creating prompts that are clear, actionable, and aligned with the intended use case.
        `;
    const systemPromptAgent = new Agent({
      name: "system-prompt-enhancer",
      instructions: ENHANCE_SYSTEM_PROMPT_INSTRUCTIONS,
      model: agent.llm?.getModel()
    });
    const result = await systemPromptAgent.generate(
      `
            We need to improve the system prompt. 
            Current: ${instructions}
            ${comment ? `User feedback: ${comment}` : ""}
            ${evalSummary ? `
Evaluation Results:
${evalSummary}` : ""}
        `,
      {
        output: lib.z.object({
          new_prompt: lib.z.string(),
          explanation: lib.z.string()
        })
      }
    );
    return c2.json(result?.object || {});
  } catch (error) {
    return handleError(error, "Error generating system prompt");
  }
}

// src/server/handlers/root.ts
async function rootHandler(c2) {
  return c2.text("Hello to the Mastra API!");
}
async function getTelemetryHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const { name, scope, page, perPage, fromDate, toDate } = c2.req.query();
    const attribute = c2.req.queries("attribute");
    const traces = await getTelemetryHandler$1({
      mastra,
      body: {
        name,
        scope,
        page: Number(page ?? 0),
        perPage: Number(perPage ?? 100),
        attribute,
        fromDate: fromDate ? new Date(fromDate) : void 0,
        toDate: toDate ? new Date(toDate) : void 0
      }
    });
    return c2.json({ traces });
  } catch (error) {
    return handleError(error, "Error getting telemetry traces");
  }
}
async function storeTelemetryHandler(c2) {
  try {
    const body = await c2.req.json();
    const mastra = c2.get("mastra");
    const result = await storeTelemetryHandler$1({ mastra, body });
    if (result.status === "error") {
      return c2.json(result, 500);
    }
    return c2.json(result, 200);
  } catch (error) {
    return handleError(error, "Error storing telemetry traces");
  }
}
async function getToolsHandler(c2) {
  try {
    const tools = c2.get("tools");
    const result = await getToolsHandler$1({
      tools
    });
    return c2.json(result || {});
  } catch (error) {
    return handleError(error, "Error getting tools");
  }
}
async function getToolByIdHandler(c2) {
  try {
    const tools = c2.get("tools");
    const toolId = c2.req.param("toolId");
    const result = await getToolByIdHandler$1({
      tools,
      toolId
    });
    return c2.json(result);
  } catch (error) {
    return handleError(error, "Error getting tool");
  }
}
function executeToolHandler(tools) {
  return async (c2) => {
    try {
      const mastra = c2.get("mastra");
      const runtimeContext = c2.get("runtimeContext");
      const toolId = decodeURIComponent(c2.req.param("toolId"));
      const runId = c2.req.query("runId");
      const { data, runtimeContext: runtimeContextFromRequest } = await c2.req.json();
      const result = await executeToolHandler$1(tools)({
        mastra,
        toolId,
        data,
        runtimeContext,
        runId,
        runtimeContextFromRequest
      });
      return c2.json(result);
    } catch (error) {
      return handleError(error, "Error executing tool");
    }
  };
}
async function executeAgentToolHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const runtimeContext = c2.get("runtimeContext");
    const agentId = c2.req.param("agentId");
    const toolId = c2.req.param("toolId");
    const { data, runtimeContext: runtimeContextFromRequest } = await c2.req.json();
    const result = await executeAgentToolHandler$1({
      mastra,
      agentId,
      toolId,
      data,
      runtimeContext,
      runtimeContextFromRequest
    });
    return c2.json(result);
  } catch (error) {
    return handleError(error, "Error executing tool");
  }
}
async function upsertVectors(c2) {
  try {
    const mastra = c2.get("mastra");
    const vectorName = c2.req.param("vectorName");
    const body = await c2.req.json();
    const result = await upsertVectors$1({
      mastra,
      vectorName,
      index: body
    });
    return c2.json({ ids: result });
  } catch (error) {
    return handleError(error, "Error upserting vectors");
  }
}
async function createIndex(c2) {
  try {
    const mastra = c2.get("mastra");
    const vectorName = c2.req.param("vectorName");
    const body = await c2.req.json();
    await createIndex$1({
      mastra,
      vectorName,
      index: body
    });
    return c2.json({ success: true });
  } catch (error) {
    return handleError(error, "Error creating index");
  }
}
async function queryVectors(c2) {
  try {
    const mastra = c2.get("mastra");
    const vectorName = c2.req.param("vectorName");
    const { indexName, queryVector, topK = 10, filter, includeVector = false } = await c2.req.json();
    const results = await queryVectors$1({
      mastra,
      vectorName,
      query: { indexName, queryVector, topK, filter, includeVector }
    });
    return c2.json({ results });
  } catch (error) {
    return handleError(error, "Error querying vectors");
  }
}
async function listIndexes(c2) {
  try {
    const mastra = c2.get("mastra");
    const vectorName = c2.req.param("vectorName");
    const indexes = await listIndexes$1({
      mastra,
      vectorName
    });
    return c2.json({ indexes });
  } catch (error) {
    return handleError(error, "Error listing indexes");
  }
}
async function describeIndex(c2) {
  try {
    const mastra = c2.get("mastra");
    const vectorName = c2.req.param("vectorName");
    const indexName = c2.req.param("indexName");
    if (!indexName) {
      throw new HTTPException$1(400, { message: "Index name is required" });
    }
    const stats = await describeIndex$1({
      mastra,
      vectorName,
      indexName
    });
    return c2.json({
      dimension: stats.dimension,
      count: stats.count,
      metric: stats.metric?.toLowerCase()
    });
  } catch (error) {
    return handleError(error, "Error describing index");
  }
}
async function deleteIndex(c2) {
  try {
    const mastra = c2.get("mastra");
    const vectorName = c2.req.param("vectorName");
    const indexName = c2.req.param("indexName");
    if (!indexName) {
      throw new HTTPException$1(400, { message: "Index name is required" });
    }
    await deleteIndex$1({
      mastra,
      vectorName,
      indexName
    });
    return c2.json({ success: true });
  } catch (error) {
    return handleError(error, "Error deleting index");
  }
}
async function getVNextWorkflowsHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const workflows = await getVNextWorkflowsHandler$1({
      mastra
    });
    return c2.json(workflows);
  } catch (error) {
    return handleError(error, "Error getting workflows");
  }
}
async function getVNextWorkflowByIdHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const workflowId = c2.req.param("workflowId");
    const workflow = await getVNextWorkflowByIdHandler$1({
      mastra,
      workflowId
    });
    return c2.json(workflow);
  } catch (error) {
    return handleError(error, "Error getting workflow");
  }
}
async function createVNextWorkflowRunHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const workflowId = c2.req.param("workflowId");
    const prevRunId = c2.req.query("runId");
    const result = await createVNextWorkflowRunHandler$1({
      mastra,
      workflowId,
      runId: prevRunId
    });
    return c2.json(result);
  } catch (e2) {
    return handleError(e2, "Error creating run");
  }
}
async function startAsyncVNextWorkflowHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const workflowId = c2.req.param("workflowId");
    const runtimeContext = c2.get("runtimeContext");
    const { inputData, runtimeContext: runtimeContextFromRequest } = await c2.req.json();
    const runId = c2.req.query("runId");
    const result = await startAsyncVNextWorkflowHandler$1({
      mastra,
      runtimeContext,
      runtimeContextFromRequest,
      workflowId,
      runId,
      inputData
    });
    return c2.json(result);
  } catch (error) {
    return handleError(error, "Error executing workflow");
  }
}
async function startVNextWorkflowRunHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const workflowId = c2.req.param("workflowId");
    const runtimeContext = c2.get("runtimeContext");
    const { inputData, runtimeContext: runtimeContextFromRequest } = await c2.req.json();
    const runId = c2.req.query("runId");
    await startVNextWorkflowRunHandler$1({
      mastra,
      runtimeContext,
      runtimeContextFromRequest,
      workflowId,
      runId,
      inputData
    });
    return c2.json({ message: "Workflow run started" });
  } catch (e2) {
    return handleError(e2, "Error starting workflow run");
  }
}
function watchVNextWorkflowHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const logger2 = mastra.getLogger();
    const workflowId = c2.req.param("workflowId");
    const runId = c2.req.query("runId");
    if (!runId) {
      throw new HTTPException$1(400, { message: "runId required to watch workflow" });
    }
    return stream(
      c2,
      async (stream4) => {
        try {
          const result = await watchVNextWorkflowHandler$1({
            mastra,
            workflowId,
            runId
          });
          stream4.onAbort(() => {
            if (!result.locked) {
              return result.cancel();
            }
          });
          for await (const chunk of result) {
            await stream4.write(chunk.toString() + "");
          }
        } catch (err) {
          console.log(err);
        }
      },
      async (err) => {
        logger2.error("Error in watch stream: " + err?.message);
      }
    );
  } catch (error) {
    return handleError(error, "Error watching workflow");
  }
}
async function resumeAsyncVNextWorkflowHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const workflowId = c2.req.param("workflowId");
    const runId = c2.req.query("runId");
    const runtimeContext = c2.get("runtimeContext");
    const { step, resumeData, runtimeContext: runtimeContextFromRequest } = await c2.req.json();
    if (!runId) {
      throw new HTTPException$1(400, { message: "runId required to resume workflow" });
    }
    const result = await resumeAsyncVNextWorkflowHandler$1({
      mastra,
      runtimeContext,
      runtimeContextFromRequest,
      workflowId,
      runId,
      body: { step, resumeData }
    });
    return c2.json(result);
  } catch (error) {
    return handleError(error, "Error resuming workflow step");
  }
}
async function resumeVNextWorkflowHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const workflowId = c2.req.param("workflowId");
    const runId = c2.req.query("runId");
    const { step, resumeData, runtimeContext } = await c2.req.json();
    if (!runId) {
      throw new HTTPException$1(400, { message: "runId required to resume workflow" });
    }
    await resumeVNextWorkflowHandler$1({
      mastra,
      runtimeContext,
      workflowId,
      runId,
      body: { step, resumeData }
    });
    return c2.json({ message: "Workflow run resumed" });
  } catch (error) {
    return handleError(error, "Error resuming workflow");
  }
}
async function getVNextWorkflowRunsHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const workflowId = c2.req.param("workflowId");
    const { fromDate, toDate, limit, offset, resourceId } = c2.req.query();
    const workflowRuns = await getVNextWorkflowRunsHandler$1({
      mastra,
      workflowId,
      fromDate: fromDate ? new Date(fromDate) : void 0,
      toDate: toDate ? new Date(toDate) : void 0,
      limit: limit ? Number(limit) : void 0,
      offset: offset ? Number(offset) : void 0,
      resourceId
    });
    return c2.json(workflowRuns);
  } catch (error) {
    return handleError(error, "Error getting workflow runs");
  }
}
async function getSpeakersHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const agentId = c2.req.param("agentId");
    const speakers = await getSpeakersHandler$1({
      mastra,
      agentId
    });
    return c2.json(speakers);
  } catch (error) {
    return handleError(error, "Error getting speakers");
  }
}
async function speakHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const agentId = c2.req.param("agentId");
    const { input, options } = await c2.req.json();
    const audioStream = await generateSpeechHandler({
      mastra,
      agentId,
      body: { text: input, speakerId: options?.speakerId }
    });
    c2.header("Content-Type", `audio/${options?.filetype ?? "mp3"}`);
    c2.header("Transfer-Encoding", "chunked");
    return c2.body(audioStream);
  } catch (error) {
    return handleError(error, "Error generating speech");
  }
}
async function listenHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const agentId = c2.req.param("agentId");
    const formData = await c2.req.formData();
    const audioFile = formData.get("audio");
    const options = formData.get("options");
    if (!audioFile || !(audioFile instanceof File)) {
      throw new HTTPException$1(400, { message: "Audio file is required" });
    }
    const audioData = await audioFile.arrayBuffer();
    let parsedOptions = {};
    try {
      parsedOptions = options ? JSON.parse(options) : {};
    } catch {
    }
    const transcription = await transcribeSpeechHandler({
      mastra,
      agentId,
      body: {
        audioData: Buffer.from(audioData),
        options: parsedOptions
      }
    });
    return c2.json({ text: transcription?.text });
  } catch (error) {
    return handleError(error, "Error transcribing speech");
  }
}
async function getWorkflowsHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const workflows = await getWorkflowsHandler$1({
      mastra
    });
    return c2.json(workflows);
  } catch (error) {
    return handleError(error, "Error getting workflows");
  }
}
async function getWorkflowByIdHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const workflowId = c2.req.param("workflowId");
    const workflow = await getWorkflowByIdHandler$1({
      mastra,
      workflowId
    });
    return c2.json(workflow);
  } catch (error) {
    return handleError(error, "Error getting workflow");
  }
}
async function startAsyncWorkflowHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const runtimeContext = c2.get("runtimeContext");
    const workflowId = c2.req.param("workflowId");
    const triggerData = await c2.req.json();
    const runId = c2.req.query("runId");
    const result = await startAsyncWorkflowHandler$1({
      mastra,
      runtimeContext,
      workflowId,
      runId,
      triggerData
    });
    return c2.json(result);
  } catch (error) {
    return handleError(error, "Error executing workflow");
  }
}
async function createRunHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const workflowId = c2.req.param("workflowId");
    const prevRunId = c2.req.query("runId");
    const result = await createRunHandler$1({
      mastra,
      workflowId,
      runId: prevRunId
    });
    return c2.json(result);
  } catch (e2) {
    return handleError(e2, "Error creating run");
  }
}
async function startWorkflowRunHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const runtimeContext = c2.get("runtimeContext");
    const workflowId = c2.req.param("workflowId");
    const triggerData = await c2.req.json();
    const runId = c2.req.query("runId");
    await startWorkflowRunHandler$1({
      mastra,
      runtimeContext,
      workflowId,
      runId,
      triggerData
    });
    return c2.json({ message: "Workflow run started" });
  } catch (e2) {
    return handleError(e2, "Error starting workflow run");
  }
}
function watchWorkflowHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const logger2 = mastra.getLogger();
    const workflowId = c2.req.param("workflowId");
    const runId = c2.req.query("runId");
    if (!runId) {
      throw new HTTPException$1(400, { message: "runId required to watch workflow" });
    }
    return stream(
      c2,
      async (stream4) => {
        try {
          const result = await watchWorkflowHandler$1({
            mastra,
            workflowId,
            runId
          });
          stream4.onAbort(() => {
            if (!result.locked) {
              return result.cancel();
            }
          });
          for await (const chunk of result) {
            await stream4.write(chunk.toString() + "");
          }
        } catch (err) {
          console.log(err);
        }
      },
      async (err) => {
        logger2.error("Error in watch stream: " + err?.message);
      }
    );
  } catch (error) {
    return handleError(error, "Error watching workflow");
  }
}
async function resumeAsyncWorkflowHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const runtimeContext = c2.get("runtimeContext");
    const workflowId = c2.req.param("workflowId");
    const runId = c2.req.query("runId");
    const { stepId, context } = await c2.req.json();
    if (!runId) {
      throw new HTTPException$1(400, { message: "runId required to resume workflow" });
    }
    const result = await resumeAsyncWorkflowHandler$1({
      mastra,
      runtimeContext,
      workflowId,
      runId,
      body: { stepId, context }
    });
    return c2.json(result);
  } catch (error) {
    return handleError(error, "Error resuming workflow step");
  }
}
async function resumeWorkflowHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const runtimeContext = c2.get("runtimeContext");
    const workflowId = c2.req.param("workflowId");
    const runId = c2.req.query("runId");
    const { stepId, context } = await c2.req.json();
    if (!runId) {
      throw new HTTPException$1(400, { message: "runId required to resume workflow" });
    }
    await resumeWorkflowHandler$1({
      mastra,
      runtimeContext,
      workflowId,
      runId,
      body: { stepId, context }
    });
    return c2.json({ message: "Workflow run resumed" });
  } catch (error) {
    return handleError(error, "Error resuming workflow");
  }
}
async function getWorkflowRunsHandler(c2) {
  try {
    const mastra = c2.get("mastra");
    const workflowId = c2.req.param("workflowId");
    const { fromDate, toDate, limit, offset, resourceId } = c2.req.query();
    const workflowRuns = await getWorkflowRunsHandler$1({
      mastra,
      workflowId,
      fromDate: fromDate ? new Date(fromDate) : void 0,
      toDate: toDate ? new Date(toDate) : void 0,
      limit: limit ? Number(limit) : void 0,
      offset: offset ? Number(offset) : void 0,
      resourceId
    });
    return c2.json(workflowRuns);
  } catch (error) {
    return handleError(error, "Error getting workflow runs");
  }
}

// src/server/welcome.ts
var html2 = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Welcome to Mastra</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/inter-ui/3.19.3/inter.min.css" />
    <style>
      body {
        margin: 0;
        padding: 0;
        background-color: #0d0d0d;
        color: #ffffff;
        font-family:
          'Inter',
          -apple-system,
          BlinkMacSystemFont,
          system-ui,
          sans-serif;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }

      main {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 2rem;
        text-align: center;
      }

      h1 {
        font-size: 4rem;
        font-weight: 600;
        margin: 0 0 1rem 0;
        background: linear-gradient(to right, #fff, #ccc);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        line-height: 1.2;
      }

      .subtitle {
        color: #9ca3af;
        font-size: 1.25rem;
        max-width: 600px;
        margin: 0 auto 3rem auto;
        line-height: 1.6;
      }

      .docs-link {
        background-color: #1a1a1a;
        padding: 1rem 2rem;
        border-radius: 0.5rem;
        display: flex;
        align-items: center;
        gap: 1rem;
        font-family: monospace;
        font-size: 1rem;
        color: #ffffff;
        text-decoration: none;
        transition: background-color 0.2s;
      }

      .docs-link:hover {
        background-color: #252525;
      }

      .arrow-icon {
        transition: transform 0.2s;
      }

      .docs-link:hover .arrow-icon {
        transform: translateX(4px);
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Welcome to Mastra</h1>
      <p class="subtitle">
        From the team that brought you Gatsby: prototype and productionize AI features with a modern JS/TS stack.
      </p>

      <a href="https://mastra.ai/docs" class="docs-link">
        Browse the docs
        <svg
          class="arrow-icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </a>
    </main>
  </body>
</html>
`;

// src/server/index.ts
async function createHonoServer(mastra, options = {}) {
  const app = new Hono();
  const server = mastra.getServer();
  let tools = {};
  try {
    const toolsPath = "./tools.mjs";
    const mastraToolsPaths = (await import(toolsPath)).tools;
    const toolImports = mastraToolsPaths ? await Promise.all(
      // @ts-ignore
      mastraToolsPaths.map(async (toolPath) => {
        return import(toolPath);
      })
    ) : [];
    tools = toolImports.reduce((acc, toolModule) => {
      Object.entries(toolModule).forEach(([key, tool]) => {
        acc[key] = tool;
      });
      return acc;
    }, {});
  } catch {
    console.error("Failed to import tools");
  }
  app.use("*", async function setTelemetryInfo(c2, next) {
    const requestId = c2.req.header("x-request-id") ?? randomUUID();
    const span = Telemetry.getActiveSpan();
    if (span) {
      span.setAttribute("http.request_id", requestId);
      span.updateName(`${c2.req.method} ${c2.req.path}`);
      const newCtx = Telemetry.setBaggage({
        "http.request_id": { value: requestId }
      });
      await new Promise((resolve) => {
        Telemetry.withContext(newCtx, async () => {
          await next();
          resolve(true);
        });
      });
    } else {
      await next();
    }
  });
  app.onError(errorHandler);
  app.use("*", function setContext(c2, next) {
    const runtimeContext = new RuntimeContext();
    const proxyRuntimeContext = new Proxy(runtimeContext, {
      get(target, prop) {
        if (prop === "get") {
          return function(key) {
            const value = target.get(key);
            return value ?? `<${key}>`;
          };
        }
        return Reflect.get(target, prop);
      }
    });
    c2.set("runtimeContext", proxyRuntimeContext);
    c2.set("mastra", mastra);
    c2.set("tools", tools);
    c2.set("playground", options.playground === true);
    c2.set("isDev", options.isDev === true);
    return next();
  });
  const serverMiddleware = mastra.getServerMiddleware?.();
  if (serverMiddleware && serverMiddleware.length > 0) {
    for (const m2 of serverMiddleware) {
      app.use(m2.path, m2.handler);
    }
  }
  if (server?.cors === false) {
    app.use("*", timeout(server?.timeout ?? 3 * 60 * 1e3));
  } else {
    const corsConfig = {
      origin: "*",
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: false,
      maxAge: 3600,
      ...server?.cors,
      allowHeaders: ["Content-Type", "Authorization", "x-mastra-client-type", ...server?.cors?.allowHeaders ?? []],
      exposeHeaders: ["Content-Length", "X-Requested-With", ...server?.cors?.exposeHeaders ?? []]
    };
    app.use("*", timeout(server?.timeout ?? 3 * 60 * 1e3), cors(corsConfig));
  }
  const bodyLimitOptions = {
    maxSize: server?.bodySizeLimit ?? 4.5 * 1024 * 1024,
    // 4.5 MB,
    onError: (c2) => c2.json({ error: "Request body too large" }, 413)
  };
  const routes = server?.apiRoutes;
  if (server?.middleware) {
    const normalizedMiddlewares = Array.isArray(server.middleware) ? server.middleware : [server.middleware];
    const middlewares = normalizedMiddlewares.map((middleware2) => {
      if (typeof middleware2 === "function") {
        return {
          path: "*",
          handler: middleware2
        };
      }
      return middleware2;
    });
    for (const middleware2 of middlewares) {
      app.use(middleware2.path, middleware2.handler);
    }
  }
  if (routes) {
    for (const route of routes) {
      const middlewares = [];
      if (route.middleware) {
        middlewares.push(...Array.isArray(route.middleware) ? route.middleware : [route.middleware]);
      }
      if (route.openapi) {
        middlewares.push(h(route.openapi));
      }
      const handler = "handler" in route ? route.handler : await route.createHandler({ mastra });
      if (route.method === "GET") {
        app.get(route.path, ...middlewares, handler);
      } else if (route.method === "POST") {
        app.post(route.path, ...middlewares, handler);
      } else if (route.method === "PUT") {
        app.put(route.path, ...middlewares, handler);
      } else if (route.method === "DELETE") {
        app.delete(route.path, ...middlewares, handler);
      } else if (route.method === "ALL") {
        app.all(route.path, ...middlewares, handler);
      }
    }
  }
  if (server?.build?.apiReqLogs) {
    app.use(logger());
  }
  app.get(
    "/.well-known/:agentId/agent.json",
    h({
      description: "Get agent configuration",
      tags: ["agents"],
      parameters: [
        {
          name: "agentId",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      responses: {
        200: {
          description: "Agent configuration"
        }
      }
    }),
    getAgentCardByIdHandler
  );
  app.post(
    "/a2a/:agentId",
    h({
      description: "Execute agent via A2A protocol",
      tags: ["agents"],
      parameters: [
        {
          name: "agentId",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                method: {
                  type: "string",
                  enum: ["tasks/send", "tasks/sendSubscribe", "tasks/get", "tasks/cancel"],
                  description: "The A2A protocol method to execute"
                },
                params: {
                  type: "object",
                  oneOf: [
                    {
                      // TaskSendParams
                      type: "object",
                      properties: {
                        id: {
                          type: "string",
                          description: "Unique identifier for the task being initiated or continued"
                        },
                        sessionId: {
                          type: "string",
                          description: "Optional identifier for the session this task belongs to"
                        },
                        message: {
                          type: "object",
                          description: "The message content to send to the agent for processing"
                        },
                        pushNotification: {
                          type: "object",
                          nullable: true,
                          description: "Optional pushNotification information for receiving notifications about this task"
                        },
                        historyLength: {
                          type: "integer",
                          nullable: true,
                          description: "Optional parameter to specify how much message history to include in the response"
                        },
                        metadata: {
                          type: "object",
                          nullable: true,
                          description: "Optional metadata associated with sending this message"
                        }
                      },
                      required: ["id", "message"]
                    },
                    {
                      // TaskQueryParams
                      type: "object",
                      properties: {
                        id: { type: "string", description: "The unique identifier of the task" },
                        historyLength: {
                          type: "integer",
                          nullable: true,
                          description: "Optional history length to retrieve for the task"
                        },
                        metadata: {
                          type: "object",
                          nullable: true,
                          description: "Optional metadata to include with the operation"
                        }
                      },
                      required: ["id"]
                    },
                    {
                      // TaskIdParams
                      type: "object",
                      properties: {
                        id: { type: "string", description: "The unique identifier of the task" },
                        metadata: {
                          type: "object",
                          nullable: true,
                          description: "Optional metadata to include with the operation"
                        }
                      },
                      required: ["id"]
                    }
                  ]
                }
              },
              required: ["method", "params"]
            }
          }
        }
      },
      responses: {
        200: {
          description: "A2A response"
        },
        400: {
          description: "Missing or invalid request parameters"
        },
        404: {
          description: "Agent not found"
        }
      }
    }),
    getAgentExecutionHandler
  );
  app.get(
    "/api",
    h({
      description: "Get API status",
      tags: ["system"],
      responses: {
        200: {
          description: "Success"
        }
      }
    }),
    rootHandler
  );
  app.get(
    "/api/agents",
    h({
      description: "Get all available agents",
      tags: ["agents"],
      responses: {
        200: {
          description: "List of all agents"
        }
      }
    }),
    getAgentsHandler
  );
  app.get(
    "/api/networks",
    h({
      description: "Get all available networks",
      tags: ["networks"],
      responses: {
        200: {
          description: "List of all networks"
        }
      }
    }),
    getNetworksHandler
  );
  app.get(
    "/api/networks/:networkId",
    h({
      description: "Get network by ID",
      tags: ["networks"],
      parameters: [
        {
          name: "networkId",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      responses: {
        200: {
          description: "Network details"
        },
        404: {
          description: "Network not found"
        }
      }
    }),
    getNetworkByIdHandler
  );
  app.post(
    "/api/networks/:networkId/generate",
    bodyLimit(bodyLimitOptions),
    h({
      description: "Generate a response from a network",
      tags: ["networks"],
      parameters: [
        {
          name: "networkId",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                input: {
                  oneOf: [
                    { type: "string" },
                    {
                      type: "array",
                      items: { type: "object" }
                    }
                  ],
                  description: "Input for the network, can be a string or an array of CoreMessage objects"
                }
              },
              required: ["input"]
            }
          }
        }
      },
      responses: {
        200: {
          description: "Generated response"
        },
        404: {
          description: "Network not found"
        }
      }
    }),
    generateHandler2
  );
  app.post(
    "/api/networks/:networkId/stream",
    bodyLimit(bodyLimitOptions),
    h({
      description: "Generate a response from a network",
      tags: ["networks"],
      parameters: [
        {
          name: "networkId",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                input: {
                  oneOf: [
                    { type: "string" },
                    {
                      type: "array",
                      items: { type: "object" }
                    }
                  ],
                  description: "Input for the network, can be a string or an array of CoreMessage objects"
                }
              },
              required: ["input"]
            }
          }
        }
      },
      responses: {
        200: {
          description: "Generated response"
        },
        404: {
          description: "Network not found"
        }
      }
    }),
    streamGenerateHandler2
  );
  app.get(
    "/api/agents/:agentId",
    h({
      description: "Get agent by ID",
      tags: ["agents"],
      parameters: [
        {
          name: "agentId",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      responses: {
        200: {
          description: "Agent details"
        },
        404: {
          description: "Agent not found"
        }
      }
    }),
    getAgentByIdHandler
  );
  app.get(
    "/api/agents/:agentId/evals/ci",
    h({
      description: "Get CI evals by agent ID",
      tags: ["agents"],
      parameters: [
        {
          name: "agentId",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      responses: {
        200: {
          description: "List of evals"
        }
      }
    }),
    getEvalsByAgentIdHandler
  );
  app.get(
    "/api/agents/:agentId/evals/live",
    h({
      description: "Get live evals by agent ID",
      tags: ["agents"],
      parameters: [
        {
          name: "agentId",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      responses: {
        200: {
          description: "List of evals"
        }
      }
    }),
    getLiveEvalsByAgentIdHandler
  );
  app.post(
    "/api/agents/:agentId/generate",
    bodyLimit(bodyLimitOptions),
    h({
      description: "Generate a response from an agent",
      tags: ["agents"],
      parameters: [
        {
          name: "agentId",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                messages: {
                  type: "array",
                  items: { type: "object" }
                },
                threadId: { type: "string" },
                resourceId: { type: "string", description: "The resource ID for the conversation" },
                resourceid: {
                  type: "string",
                  description: "The resource ID for the conversation (deprecated, use resourceId instead)",
                  deprecated: true
                },
                runId: { type: "string" },
                output: { type: "object" }
              },
              required: ["messages"]
            }
          }
        }
      },
      responses: {
        200: {
          description: "Generated response"
        },
        404: {
          description: "Agent not found"
        }
      }
    }),
    generateHandler
  );
  app.post(
    "/api/agents/:agentId/stream",
    bodyLimit(bodyLimitOptions),
    h({
      description: "Stream a response from an agent",
      tags: ["agents"],
      parameters: [
        {
          name: "agentId",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                messages: {
                  type: "array",
                  items: { type: "object" }
                },
                threadId: { type: "string" },
                resourceId: { type: "string", description: "The resource ID for the conversation" },
                resourceid: {
                  type: "string",
                  description: "The resource ID for the conversation (deprecated, use resourceId instead)",
                  deprecated: true
                },
                runId: { type: "string" },
                output: { type: "object" }
              },
              required: ["messages"]
            }
          }
        }
      },
      responses: {
        200: {
          description: "Streamed response"
        },
        404: {
          description: "Agent not found"
        }
      }
    }),
    streamGenerateHandler
  );
  if (options.isDev) {
    app.post(
      "/api/agents/:agentId/instructions",
      bodyLimit(bodyLimitOptions),
      h({
        description: "Update an agent's instructions",
        tags: ["agents"],
        parameters: [
          {
            name: "agentId",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  instructions: {
                    type: "string",
                    description: "New instructions for the agent"
                  }
                },
                required: ["instructions"]
              }
            }
          }
        },
        responses: {
          200: {
            description: "Instructions updated successfully"
          },
          403: {
            description: "Not allowed in non-playground environment"
          },
          404: {
            description: "Agent not found"
          }
        }
      }),
      setAgentInstructionsHandler
    );
    app.post(
      "/api/agents/:agentId/instructions/enhance",
      bodyLimit(bodyLimitOptions),
      h({
        description: "Generate an improved system prompt from instructions",
        tags: ["agents"],
        parameters: [
          {
            name: "agentId",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "ID of the agent whose model will be used for prompt generation"
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  instructions: {
                    type: "string",
                    description: "Instructions to generate a system prompt from"
                  },
                  comment: {
                    type: "string",
                    description: "Optional comment for the enhanced prompt"
                  }
                },
                required: ["instructions"]
              }
            }
          }
        },
        responses: {
          200: {
            description: "Generated system prompt and analysis",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    explanation: {
                      type: "string",
                      description: "Detailed analysis of the instructions"
                    },
                    new_prompt: {
                      type: "string",
                      description: "The enhanced system prompt"
                    }
                  }
                }
              }
            }
          },
          400: {
            description: "Missing or invalid request parameters"
          },
          404: {
            description: "Agent not found"
          },
          500: {
            description: "Internal server error or model response parsing error"
          }
        }
      }),
      generateSystemPromptHandler
    );
  }
  app.get(
    "/api/agents/:agentId/speakers",
    async (c2, next) => {
      c2.header("Deprecation", "true");
      c2.header("Warning", '299 - "This endpoint is deprecated, use /api/agents/:agentId/voice/speakers instead"');
      c2.header("Link", '</api/agents/:agentId/voice/speakers>; rel="successor-version"');
      return next();
    },
    h({
      description: "[DEPRECATED] Use /api/agents/:agentId/voice/speakers instead. Get available speakers for an agent",
      tags: ["agents"],
      parameters: [
        {
          name: "agentId",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      responses: {
        200: {
          description: "List of available speakers",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: {
                  type: "object",
                  description: "Speaker information depending on the voice provider",
                  properties: {
                    voiceId: { type: "string" }
                  },
                  additionalProperties: true
                }
              }
            }
          }
        },
        400: {
          description: "Agent does not have voice capabilities"
        },
        404: {
          description: "Agent not found"
        }
      }
    }),
    getSpeakersHandler
  );
  app.get(
    "/api/agents/:agentId/voice/speakers",
    h({
      description: "Get available speakers for an agent",
      tags: ["agents"],
      parameters: [
        {
          name: "agentId",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      responses: {
        200: {
          description: "List of available speakers",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: {
                  type: "object",
                  description: "Speaker information depending on the voice provider",
                  properties: {
                    voiceId: { type: "string" }
                  },
                  additionalProperties: true
                }
              }
            }
          }
        },
        400: {
          description: "Agent does not have voice capabilities"
        },
        404: {
          description: "Agent not found"
        }
      }
    }),
    getSpeakersHandler
  );
  app.post(
    "/api/agents/:agentId/speak",
    bodyLimit(bodyLimitOptions),
    async (c2, next) => {
      c2.header("Deprecation", "true");
      c2.header("Warning", '299 - "This endpoint is deprecated, use /api/agents/:agentId/voice/speak instead"');
      c2.header("Link", '</api/agents/:agentId/voice/speak>; rel="successor-version"');
      return next();
    },
    h({
      description: "[DEPRECATED] Use /api/agents/:agentId/voice/speak instead. Convert text to speech using the agent's voice provider",
      tags: ["agents"],
      parameters: [
        {
          name: "agentId",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                text: {
                  type: "string",
                  description: "Text to convert to speech"
                },
                options: {
                  type: "object",
                  description: "Provider-specific options for speech generation",
                  properties: {
                    speaker: {
                      type: "string",
                      description: "Speaker ID to use for speech generation"
                    }
                  },
                  additionalProperties: true
                }
              },
              required: ["text"]
            }
          }
        }
      },
      responses: {
        200: {
          description: "Audio stream",
          content: {
            "audio/mpeg": {
              schema: {
                format: "binary",
                description: "Audio stream containing the generated speech"
              }
            },
            "audio/*": {
              schema: {
                format: "binary",
                description: "Audio stream depending on the provider"
              }
            }
          }
        },
        400: {
          description: "Agent does not have voice capabilities or invalid request"
        },
        404: {
          description: "Agent not found"
        }
      }
    }),
    speakHandler
  );
  app.post(
    "/api/agents/:agentId/voice/speak",
    bodyLimit(bodyLimitOptions),
    h({
      description: "Convert text to speech using the agent's voice provider",
      tags: ["agents"],
      parameters: [
        {
          name: "agentId",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                input: {
                  type: "string",
                  description: "Text to convert to speech"
                },
                options: {
                  type: "object",
                  description: "Provider-specific options for speech generation",
                  properties: {
                    speaker: {
                      type: "string",
                      description: "Speaker ID to use for speech generation"
                    },
                    options: {
                      type: "object",
                      description: "Provider-specific options for speech generation",
                      additionalProperties: true
                    }
                  },
                  additionalProperties: true
                }
              },
              required: ["text"]
            }
          }
        }
      },
      responses: {
        200: {
          description: "Audio stream",
          content: {
            "audio/mpeg": {
              schema: {
                format: "binary",
                description: "Audio stream containing the generated speech"
              }
            },
            "audio/*": {
              schema: {
                format: "binary",
                description: "Audio stream depending on the provider"
              }
            }
          }
        },
        400: {
          description: "Agent does not have voice capabilities or invalid request"
        },
        404: {
          description: "Agent not found"
        }
      }
    }),
    speakHandler
  );
  app.post(
    "/api/agents/:agentId/listen",
    bodyLimit({
      ...bodyLimitOptions,
      maxSize: 10 * 1024 * 1024
      // 10 MB for audio files
    }),
    async (c2, next) => {
      c2.header("Deprecation", "true");
      c2.header("Warning", '299 - "This endpoint is deprecated, use /api/agents/:agentId/voice/listen instead"');
      c2.header("Link", '</api/agents/:agentId/voice/listen>; rel="successor-version"');
      return next();
    },
    h({
      description: "[DEPRECATED] Use /api/agents/:agentId/voice/listen instead. Convert speech to text using the agent's voice provider. Additional provider-specific options can be passed as query parameters.",
      tags: ["agents"],
      parameters: [
        {
          name: "agentId",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "audio/mpeg": {
            schema: {
              format: "binary",
              description: "Audio data stream to transcribe (supports various formats depending on provider like mp3, wav, webm, flac)"
            }
          }
        }
      },
      responses: {
        200: {
          description: "Transcription result",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  text: {
                    type: "string",
                    description: "Transcribed text"
                  }
                }
              }
            }
          }
        },
        400: {
          description: "Agent does not have voice capabilities or invalid request"
        },
        404: {
          description: "Agent not found"
        }
      }
    }),
    listenHandler
  );
  app.post(
    "/api/agents/:agentId/voice/listen",
    bodyLimit({
      ...bodyLimitOptions,
      maxSize: 10 * 1024 * 1024
      // 10 MB for audio files
    }),
    h({
      description: "Convert speech to text using the agent's voice provider. Additional provider-specific options can be passed as query parameters.",
      tags: ["agents"],
      parameters: [
        {
          name: "agentId",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["audio"],
              properties: {
                audio: {
                  type: "string",
                  format: "binary",
                  description: "Audio data stream to transcribe (supports various formats depending on provider like mp3, wav, webm, flac)"
                },
                options: {
                  type: "object",
                  description: "Provider-specific options for speech-to-text",
                  additionalProperties: true
                }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: "Transcription result",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  text: {
                    type: "string",
                    description: "Transcribed text"
                  }
                }
              }
            }
          }
        },
        400: {
          description: "Agent does not have voice capabilities or invalid request"
        },
        404: {
          description: "Agent not found"
        }
      }
    }),
    listenHandler
  );
  app.post(
    "/api/agents/:agentId/tools/:toolId/execute",
    bodyLimit(bodyLimitOptions),
    h({
      description: "Execute a tool through an agent",
      tags: ["agents"],
      parameters: [
        {
          name: "agentId",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "toolId",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: { type: "object" },
                runtimeContext: { type: "object" }
              },
              required: ["data"]
            }
          }
        }
      },
      responses: {
        200: {
          description: "Tool execution result"
        },
        404: {
          description: "Tool or agent not found"
        }
      }
    }),
    executeAgentToolHandler
  );
  app.post(
    "/api/servers/:serverId/mcp",
    bodyLimit(bodyLimitOptions),
    h({
      description: "Send a message to an MCP server using Streamable HTTP",
      tags: ["mcp"],
      parameters: [
        {
          name: "serverId",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        content: { "application/json": { schema: { type: "object" } } }
      },
      responses: {
        200: {
          description: "Streamable HTTP connection processed"
        },
        404: {
          description: "MCP server not found"
        }
      }
    }),
    getMcpServerMessageHandler
  );
  const mcpSseBasePath = "/api/servers/:serverId/sse";
  const mcpSseMessagePath = "/api/servers/:serverId/messages";
  app.get(
    mcpSseBasePath,
    h({
      description: "Establish an MCP Server-Sent Events (SSE) connection with a server instance.",
      tags: ["mcp"],
      parameters: [
        {
          name: "serverId",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "The ID of the MCP server instance."
        }
      ],
      responses: {
        200: {
          description: "SSE connection established. The client will receive events over this connection. (Content-Type: text/event-stream)"
        },
        404: { description: "MCP server instance not found." },
        500: { description: "Internal server error establishing SSE connection." }
      }
    }),
    getMcpServerSseHandler
  );
  app.post(
    mcpSseMessagePath,
    bodyLimit(bodyLimitOptions),
    // Apply body limit for messages
    h({
      description: "Send a message to an MCP server over an established SSE connection.",
      tags: ["mcp"],
      parameters: [
        {
          name: "serverId",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "The ID of the MCP server instance."
        }
      ],
      requestBody: {
        description: "JSON-RPC message to send to the MCP server.",
        required: true,
        content: { "application/json": { schema: { type: "object" } } }
        // MCP messages are typically JSON
      },
      responses: {
        200: {
          description: "Message received and is being processed by the MCP server. The actual result or error will be sent as an SSE event over the established connection."
        },
        400: { description: "Bad request (e.g., invalid JSON payload or missing body)." },
        404: { description: "MCP server instance not found or SSE connection path incorrect." },
        503: { description: "SSE connection not established with this server, or server unable to process message." }
      }
    }),
    getMcpServerSseHandler
  );
  app.get(
    "/api/memory/status",
    h({
      description: "Get memory status",
      tags: ["memory"],
      parameters: [
        {
          name: "agentId",
          in: "query",
          required: true,
          schema: { type: "string" }
        }
      ],
      responses: {
        200: {
          description: "Memory status"
        }
      }
    }),
    getMemoryStatusHandler
  );
  app.get(
    "/api/memory/threads",
    h({
      description: "Get all threads",
      tags: ["memory"],
      parameters: [
        {
          name: "resourceid",
          in: "query",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "agentId",
          in: "query",
          required: true,
          schema: { type: "string" }
        }
      ],
      responses: {
        200: {
          description: "List of all threads"
        }
      }
    }),
    getThreadsHandler
  );
  app.get(
    "/api/memory/threads/:threadId",
    h({
      description: "Get thread by ID",
      tags: ["memory"],
      parameters: [
        {
          name: "threadId",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "agentId",
          in: "query",
          required: true,
          schema: { type: "string" }
        }
      ],
      responses: {
        200: {
          description: "Thread details"
        },
        404: {
          description: "Thread not found"
        }
      }
    }),
    getThreadByIdHandler
  );
  app.get(
    "/api/memory/threads/:threadId/messages",
    h({
      description: "Get messages for a thread",
      tags: ["memory"],
      parameters: [
        {
          name: "threadId",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "agentId",
          in: "query",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "number" },
          description: "Limit the number of messages to retrieve (default: 40)"
        }
      ],
      responses: {
        200: {
          description: "List of messages"
        }
      }
    }),
    getMessagesHandler
  );
  app.post(
    "/api/memory/threads",
    bodyLimit(bodyLimitOptions),
    h({
      description: "Create a new thread",
      tags: ["memory"],
      parameters: [
        {
          name: "agentId",
          in: "query",
          required: true,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                metadata: { type: "object" },
                resourceId: { type: "string" },
                threadId: { type: "string" }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: "Created thread"
        }
      }
    }),
    createThreadHandler
  );
  app.patch(
    "/api/memory/threads/:threadId",
    h({
      description: "Update a thread",
      tags: ["memory"],
      parameters: [
        {
          name: "threadId",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "agentId",
          in: "query",
          required: true,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object" }
          }
        }
      },
      responses: {
        200: {
          description: "Updated thread"
        },
        404: {
          description: "Thread not found"
        }
      }
    }),
    updateThreadHandler
  );
  app.delete(
    "/api/memory/threads/:threadId",
    h({
      description: "Delete a thread",
      tags: ["memory"],
      parameters: [
        {
          name: "threadId",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "agentId",
          in: "query",
          required: true,
          schema: { type: "string" }
        }
      ],
      responses: {
        200: {
          description: "Thread deleted"
        },
        404: {
          description: "Thread not found"
        }
      }
    }),
    deleteThreadHandler
  );
  app.post(
    "/api/memory/save-messages",
    bodyLimit(bodyLimitOptions),
    h({
      description: "Save messages",
      tags: ["memory"],
      parameters: [
        {
          name: "agentId",
          in: "query",
          required: true,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                messages: {
                  type: "array",
                  items: { type: "object" }
                }
              },
              required: ["messages"]
            }
          }
        }
      },
      responses: {
        200: {
          description: "Messages saved"
        }
      }
    }),
    saveMessagesHandler
  );
  app.get(
    "/api/telemetry",
    h({
      description: "Get all traces",
      tags: ["telemetry"],
      responses: {
        200: {
          description: "List of all traces (paged)"
        }
      }
    }),
    getTelemetryHandler
  );
  app.post(
    "/api/telemetry",
    h({
      description: "Store telemetry",
      tags: ["telemetry"],
      responses: {
        200: {
          description: "Traces stored"
        }
      }
    }),
    storeTelemetryHandler
  );
  app.get(
    "/api/workflows/v-next",
    h({
      description: "Get all vNext workflows",
      tags: ["vNextWorkflows"],
      responses: {
        200: {
          description: "List of all vNext workflows"
        }
      }
    }),
    getVNextWorkflowsHandler
  );
  app.get(
    "/api/workflows/v-next/:workflowId",
    h({
      description: "Get vNext workflow by ID",
      tags: ["vNextWorkflows"],
      parameters: [
        {
          name: "workflowId",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      responses: {
        200: {
          description: "vNext workflow details"
        },
        404: {
          description: "vNext workflow not found"
        }
      }
    }),
    getVNextWorkflowByIdHandler
  );
  app.get(
    "/api/workflows/v-next/:workflowId/runs",
    h({
      description: "Get all runs for a vNext workflow",
      tags: ["vNextWorkflows"],
      parameters: [
        {
          name: "workflowId",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        { name: "fromDate", in: "query", required: false, schema: { type: "string", format: "date-time" } },
        { name: "toDate", in: "query", required: false, schema: { type: "string", format: "date-time" } },
        { name: "limit", in: "query", required: false, schema: { type: "number" } },
        { name: "offset", in: "query", required: false, schema: { type: "number" } },
        { name: "resourceId", in: "query", required: false, schema: { type: "string" } }
      ],
      responses: {
        200: {
          description: "List of vNext workflow runs from storage"
        }
      }
    }),
    getVNextWorkflowRunsHandler
  );
  app.post(
    "/api/workflows/v-next/:workflowId/resume",
    h({
      description: "Resume a suspended vNext workflow step",
      tags: ["vNextWorkflows"],
      parameters: [
        {
          name: "workflowId",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "runId",
          in: "query",
          required: true,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                step: {
                  oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }]
                },
                resumeData: { type: "object" },
                runtimeContext: {
                  type: "object",
                  description: "Runtime context for the workflow execution"
                }
              },
              required: ["step"]
            }
          }
        }
      }
    }),
    resumeVNextWorkflowHandler
  );
  app.post(
    "/api/workflows/v-next/:workflowId/resume-async",
    bodyLimit(bodyLimitOptions),
    h({
      description: "Resume a suspended vNext workflow step",
      tags: ["vNextWorkflows"],
      parameters: [
        {
          name: "workflowId",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "runId",
          in: "query",
          required: true,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                step: {
                  oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }]
                },
                resumeData: { type: "object" },
                runtimeContext: {
                  type: "object",
                  description: "Runtime context for the workflow execution"
                }
              },
              required: ["step"]
            }
          }
        }
      }
    }),
    resumeAsyncVNextWorkflowHandler
  );
  app.post(
    "/api/workflows/v-next/:workflowId/create-run",
    bodyLimit(bodyLimitOptions),
    h({
      description: "Create a new vNext workflow run",
      tags: ["vNextWorkflows"],
      parameters: [
        {
          name: "workflowId",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "runId",
          in: "query",
          required: false,
          schema: { type: "string" }
        }
      ],
      responses: {
        200: {
          description: "New vNext workflow run created"
        }
      }
    }),
    createVNextWorkflowRunHandler
  );
  app.post(
    "/api/workflows/v-next/:workflowId/start-async",
    bodyLimit(bodyLimitOptions),
    h({
      description: "Execute/Start a vNext workflow",
      tags: ["vNextWorkflows"],
      parameters: [
        {
          name: "workflowId",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "runId",
          in: "query",
          required: false,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                inputData: { type: "object" },
                runtimeContext: {
                  type: "object",
                  description: "Runtime context for the workflow execution"
                }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: "vNext workflow execution result"
        },
        404: {
          description: "vNext workflow not found"
        }
      }
    }),
    startAsyncVNextWorkflowHandler
  );
  app.post(
    "/api/workflows/v-next/:workflowId/start",
    h({
      description: "Create and start a new vNext workflow run",
      tags: ["vNextWorkflows"],
      parameters: [
        {
          name: "workflowId",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "runId",
          in: "query",
          required: true,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                inputData: { type: "object" },
                runtimeContext: {
                  type: "object",
                  description: "Runtime context for the workflow execution"
                }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: "vNext workflow run started"
        },
        404: {
          description: "vNext workflow not found"
        }
      }
    }),
    startVNextWorkflowRunHandler
  );
  app.get(
    "/api/workflows/v-next/:workflowId/watch",
    h({
      description: "Watch vNext workflow transitions in real-time",
      parameters: [
        {
          name: "workflowId",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "runId",
          in: "query",
          required: false,
          schema: { type: "string" }
        }
      ],
      tags: ["vNextWorkflows"],
      responses: {
        200: {
          description: "vNext workflow transitions in real-time"
        }
      }
    }),
    watchVNextWorkflowHandler
  );
  app.get(
    "/api/workflows",
    h({
      description: "Get all workflows",
      tags: ["workflows"],
      responses: {
        200: {
          description: "List of all workflows"
        }
      }
    }),
    getWorkflowsHandler
  );
  app.get(
    "/api/workflows/:workflowId",
    h({
      description: "Get workflow by ID",
      tags: ["workflows"],
      parameters: [
        {
          name: "workflowId",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      responses: {
        200: {
          description: "Workflow details"
        },
        404: {
          description: "Workflow not found"
        }
      }
    }),
    getWorkflowByIdHandler
  );
  app.get(
    "/api/workflows/:workflowId/runs",
    h({
      description: "Get all runs for a workflow",
      tags: ["workflows"],
      parameters: [
        {
          name: "workflowId",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        { name: "fromDate", in: "query", required: false, schema: { type: "string", format: "date-time" } },
        { name: "toDate", in: "query", required: false, schema: { type: "string", format: "date-time" } },
        { name: "limit", in: "query", required: false, schema: { type: "number" } },
        { name: "offset", in: "query", required: false, schema: { type: "number" } },
        { name: "resourceId", in: "query", required: false, schema: { type: "string" } }
      ],
      responses: {
        200: {
          description: "List of workflow runs from storage"
        }
      }
    }),
    getWorkflowRunsHandler
  );
  app.post(
    "/api/workflows/:workflowId/resume",
    h({
      description: "Resume a suspended workflow step",
      tags: ["workflows"],
      parameters: [
        {
          name: "workflowId",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "runId",
          in: "query",
          required: true,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                stepId: { type: "string" },
                context: { type: "object" }
              }
            }
          }
        }
      }
    }),
    resumeWorkflowHandler
  );
  app.post(
    "/api/workflows/:workflowId/resumeAsync",
    bodyLimit(bodyLimitOptions),
    h({
      description: "@deprecated Use /api/workflows/:workflowId/resume-async instead",
      tags: ["workflows"],
      parameters: [
        {
          name: "workflowId",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "runId",
          in: "query",
          required: true,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                stepId: { type: "string" },
                context: { type: "object" }
              }
            }
          }
        }
      }
    }),
    resumeAsyncWorkflowHandler
  );
  app.post(
    "/api/workflows/:workflowId/resume-async",
    bodyLimit(bodyLimitOptions),
    h({
      description: "Resume a suspended workflow step",
      tags: ["workflows"],
      parameters: [
        {
          name: "workflowId",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "runId",
          in: "query",
          required: true,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                stepId: { type: "string" },
                context: { type: "object" }
              }
            }
          }
        }
      }
    }),
    resumeAsyncWorkflowHandler
  );
  app.post(
    "/api/workflows/:workflowId/createRun",
    h({
      description: "Create a new workflow run",
      tags: ["workflows"],
      parameters: [
        {
          name: "workflowId",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "runId",
          in: "query",
          required: false,
          schema: { type: "string" }
        }
      ],
      responses: {
        200: {
          description: "New workflow run created"
        }
      }
    }),
    createRunHandler
  );
  app.post(
    "/api/workflows/:workflowId/startAsync",
    bodyLimit(bodyLimitOptions),
    h({
      description: "@deprecated Use /api/workflows/:workflowId/start-async instead",
      tags: ["workflows"],
      parameters: [
        {
          name: "workflowId",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "runId",
          in: "query",
          required: false,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                input: { type: "object" }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: "Workflow execution result"
        },
        404: {
          description: "Workflow not found"
        }
      }
    }),
    startAsyncWorkflowHandler
  );
  app.post(
    "/api/workflows/:workflowId/start-async",
    bodyLimit(bodyLimitOptions),
    h({
      description: "Execute/Start a workflow",
      tags: ["workflows"],
      parameters: [
        {
          name: "workflowId",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "runId",
          in: "query",
          required: false,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                input: { type: "object" }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: "Workflow execution result"
        },
        404: {
          description: "Workflow not found"
        }
      }
    }),
    startAsyncWorkflowHandler
  );
  app.post(
    "/api/workflows/:workflowId/start",
    h({
      description: "Create and start a new workflow run",
      tags: ["workflows"],
      parameters: [
        {
          name: "workflowId",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "runId",
          in: "query",
          required: true,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                input: { type: "object" }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: "Workflow run started"
        },
        404: {
          description: "Workflow not found"
        }
      }
    }),
    startWorkflowRunHandler
  );
  app.get(
    "/api/workflows/:workflowId/watch",
    h({
      description: "Watch workflow transitions in real-time",
      parameters: [
        {
          name: "workflowId",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "runId",
          in: "query",
          required: false,
          schema: { type: "string" }
        }
      ],
      tags: ["workflows"],
      responses: {
        200: {
          description: "Workflow transitions in real-time"
        }
      }
    }),
    watchWorkflowHandler
  );
  app.get(
    "/api/logs",
    h({
      description: "Get all logs",
      tags: ["logs"],
      parameters: [
        {
          name: "transportId",
          in: "query",
          required: true,
          schema: { type: "string" }
        }
      ],
      responses: {
        200: {
          description: "List of all logs"
        }
      }
    }),
    getLogsHandler
  );
  app.get(
    "/api/logs/transports",
    h({
      description: "List of all log transports",
      tags: ["logs"],
      responses: {
        200: {
          description: "List of all log transports"
        }
      }
    }),
    getLogTransports
  );
  app.get(
    "/api/logs/:runId",
    h({
      description: "Get logs by run ID",
      tags: ["logs"],
      parameters: [
        {
          name: "runId",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "transportId",
          in: "query",
          required: true,
          schema: { type: "string" }
        }
      ],
      responses: {
        200: {
          description: "List of logs for run ID"
        }
      }
    }),
    getLogsByRunIdHandler
  );
  app.get(
    "/api/tools",
    h({
      description: "Get all tools",
      tags: ["tools"],
      responses: {
        200: {
          description: "List of all tools"
        }
      }
    }),
    getToolsHandler
  );
  app.get(
    "/api/tools/:toolId",
    h({
      description: "Get tool by ID",
      tags: ["tools"],
      parameters: [
        {
          name: "toolId",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      responses: {
        200: {
          description: "Tool details"
        },
        404: {
          description: "Tool not found"
        }
      }
    }),
    getToolByIdHandler
  );
  app.post(
    "/api/tools/:toolId/execute",
    bodyLimit(bodyLimitOptions),
    h({
      description: "Execute a tool",
      tags: ["tools"],
      parameters: [
        {
          name: "toolId",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "runId",
          in: "query",
          required: false,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: { type: "object" },
                runtimeContext: { type: "object" }
              },
              required: ["data"]
            }
          }
        }
      },
      responses: {
        200: {
          description: "Tool execution result"
        },
        404: {
          description: "Tool not found"
        }
      }
    }),
    executeToolHandler(tools)
  );
  app.post(
    "/api/vector/:vectorName/upsert",
    bodyLimit(bodyLimitOptions),
    h({
      description: "Upsert vectors into an index",
      tags: ["vector"],
      parameters: [
        {
          name: "vectorName",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                indexName: { type: "string" },
                vectors: {
                  type: "array",
                  items: {
                    type: "array",
                    items: { type: "number" }
                  }
                },
                metadata: {
                  type: "array",
                  items: { type: "object" }
                },
                ids: {
                  type: "array",
                  items: { type: "string" }
                }
              },
              required: ["indexName", "vectors"]
            }
          }
        }
      },
      responses: {
        200: {
          description: "Vectors upserted successfully"
        }
      }
    }),
    upsertVectors
  );
  app.post(
    "/api/vector/:vectorName/create-index",
    bodyLimit(bodyLimitOptions),
    h({
      description: "Create a new vector index",
      tags: ["vector"],
      parameters: [
        {
          name: "vectorName",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                indexName: { type: "string" },
                dimension: { type: "number" },
                metric: {
                  type: "string",
                  enum: ["cosine", "euclidean", "dotproduct"]
                }
              },
              required: ["indexName", "dimension"]
            }
          }
        }
      },
      responses: {
        200: {
          description: "Index created successfully"
        }
      }
    }),
    createIndex
  );
  app.post(
    "/api/vector/:vectorName/query",
    bodyLimit(bodyLimitOptions),
    h({
      description: "Query vectors from an index",
      tags: ["vector"],
      parameters: [
        {
          name: "vectorName",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                indexName: { type: "string" },
                queryVector: {
                  type: "array",
                  items: { type: "number" }
                },
                topK: { type: "number" },
                filter: { type: "object" },
                includeVector: { type: "boolean" }
              },
              required: ["indexName", "queryVector"]
            }
          }
        }
      },
      responses: {
        200: {
          description: "Query results"
        }
      }
    }),
    queryVectors
  );
  app.get(
    "/api/vector/:vectorName/indexes",
    h({
      description: "List all indexes for a vector store",
      tags: ["vector"],
      parameters: [
        {
          name: "vectorName",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      responses: {
        200: {
          description: "List of indexes"
        }
      }
    }),
    listIndexes
  );
  app.get(
    "/api/vector/:vectorName/indexes/:indexName",
    h({
      description: "Get details about a specific index",
      tags: ["vector"],
      parameters: [
        {
          name: "vectorName",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "indexName",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      responses: {
        200: {
          description: "Index details"
        }
      }
    }),
    describeIndex
  );
  app.delete(
    "/api/vector/:vectorName/indexes/:indexName",
    h({
      description: "Delete a specific index",
      tags: ["vector"],
      parameters: [
        {
          name: "vectorName",
          in: "path",
          required: true,
          schema: { type: "string" }
        },
        {
          name: "indexName",
          in: "path",
          required: true,
          schema: { type: "string" }
        }
      ],
      responses: {
        200: {
          description: "Index deleted successfully"
        }
      }
    }),
    deleteIndex
  );
  if (options?.isDev || server?.build?.openAPIDocs || server?.build?.swaggerUI) {
    app.get(
      "/openapi.json",
      f(app, {
        documentation: {
          info: { title: "Mastra API", version: "1.0.0", description: "Mastra API" }
        }
      })
    );
  }
  if (options?.isDev || server?.build?.swaggerUI) {
    app.get("/swagger-ui", middleware({ url: "/openapi.json" }));
  }
  if (options?.playground) {
    app.get("/refresh-events", handleClientsRefresh);
    app.post("/__refresh", handleTriggerClientsRefresh);
    app.use("/assets/*", async (c2, next) => {
      const path = c2.req.path;
      if (path.endsWith(".js")) {
        c2.header("Content-Type", "application/javascript");
      } else if (path.endsWith(".css")) {
        c2.header("Content-Type", "text/css");
      }
      await next();
    });
    app.use(
      "/assets/*",
      serveStatic({
        root: "./playground/assets"
      })
    );
    app.use(
      "*",
      serveStatic({
        root: "./playground"
      })
    );
  }
  app.get("*", async (c2, next) => {
    if (c2.req.path.startsWith("/api/") || c2.req.path.startsWith("/swagger-ui") || c2.req.path.startsWith("/openapi.json")) {
      return await next();
    }
    if (options?.playground) {
      const indexHtml = await readFile(join(process.cwd(), "./playground/index.html"), "utf-8");
      return c2.newResponse(indexHtml, 200, { "Content-Type": "text/html" });
    }
    return c2.newResponse(html2, 200, { "Content-Type": "text/html" });
  });
  return app;
}

export { createHonoServer };
