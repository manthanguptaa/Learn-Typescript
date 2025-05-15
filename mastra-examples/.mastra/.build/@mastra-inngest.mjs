import { randomUUID } from 'crypto';
import { d as dist } from './realtime.mjs';
import { N as NewWorkflow, R as Run, D as DefaultExecutionEngine } from './vNext.mjs';
import { a as getAugmentedNamespace } from './_commonjsHelpers.mjs';
import { I as InngestCommHandler } from './_virtual__virtual-inngest.mjs';
import { RuntimeContext } from './@mastra-core-runtime-context.mjs';

var hono = {};

// src/helper/adapter/index.ts
var env = (c, runtime) => {
  const global = globalThis;
  const globalEnv = global?.process?.env;
  runtime ??= getRuntimeKey();
  const runtimeEnvHandlers = {
    bun: () => globalEnv,
    node: () => globalEnv,
    "edge-light": () => globalEnv,
    deno: () => {
      return Deno.env.toObject();
    },
    workerd: () => c.env,
    fastly: () => ({}),
    other: () => ({})
  };
  return runtimeEnvHandlers[runtime]();
};
var knownUserAgents = {
  deno: "Deno",
  bun: "Bun",
  workerd: "Cloudflare-Workers",
  node: "Node.js"
};
var getRuntimeKey = () => {
  const global = globalThis;
  const userAgentSupported = typeof navigator !== "undefined" && typeof navigator.userAgent === "string";
  if (userAgentSupported) {
    for (const [runtimeKey, userAgent] of Object.entries(knownUserAgents)) {
      if (checkUserAgentEquals(userAgent)) {
        return runtimeKey;
      }
    }
  }
  if (typeof global?.EdgeRuntime === "string") {
    return "edge-light";
  }
  if (global?.fastly !== void 0) {
    return "fastly";
  }
  if (global?.process?.release?.name === "node") {
    return "node";
  }
  return "other";
};
var checkUserAgentEquals = (platform) => {
  const userAgent = navigator.userAgent;
  return userAgent.startsWith(platform);
};

var adapter = /*#__PURE__*/Object.freeze({
  __proto__: null,
  checkUserAgentEquals: checkUserAgentEquals,
  env: env,
  getRuntimeKey: getRuntimeKey,
  knownUserAgents: knownUserAgents
});

var require$$0 = /*@__PURE__*/getAugmentedNamespace(adapter);

(function (exports) {
	/**
	 * An adapter for Hono to serve and register any declared functions with
	 * Inngest, making them available to be triggered by events.
	 *
	 * @example
	 * ```ts
	 * const handler = serve({
	 *   client: inngest,
	 *   functions
	 * });
	 *
	 * app.use('/api/inngest',  async (c) => {
	 *   return handler(c);
	 * });
	 * ```
	 *
	 * @module
	 */
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.serve = exports.frameworkName = void 0;
	const adapter_1 = require$$0;
	const InngestCommHandler_js_1 = InngestCommHandler;
	/**
	 * The name of the framework, used to identify the framework in Inngest
	 * dashboards and during testing.
	 */
	exports.frameworkName = "hono";
	/**
	 * Using Hono, serve and register any declared functions with Inngest,
	 * making them available to be triggered by events.
	 *
	 * @example
	 * ```ts
	 * const handler = serve({
	 *   client: inngest,
	 *   functions
	 * });
	 *
	 * app.use('/api/inngest',  async (c) => {
	 *   return handler(c);
	 * });
	 * ```
	 *
	 * @public
	 */
	// Has explicit return type to avoid JSR-defined "slow types"
	const serve = (options) => {
	    const handler = new InngestCommHandler_js_1.InngestCommHandler(Object.assign(Object.assign({ fetch: fetch.bind(globalThis), frameworkName: exports.frameworkName }, options), { handler: (c) => {
	            return {
	                transformResponse: ({ headers, status, body }) => {
	                    return c.body(body, { headers, status });
	                },
	                url: () => {
	                    try {
	                        // If this is an absolute URL, use it right now.
	                        return new URL(c.req.url);
	                    }
	                    catch (_a) {
	                        // no-op
	                    }
	                    // We now know that `c.req.url` is a relative URL, so let's try
	                    // to build a base URL to pair it with.
	                    const host = options.serveHost || c.req.header("host");
	                    if (!host) {
	                        throw new Error("No host header found in request and no `serveHost` given either.");
	                    }
	                    let baseUrl = host;
	                    // Only set the scheme if we don't already have one, as a user may
	                    // have specified the protocol in `serveHost` as a way to force it
	                    // in their environment, e.g. for testing.
	                    if (!baseUrl.includes("://")) {
	                        let scheme = "https";
	                        try {
	                            // If we're in dev, assume `http` instead. Not that we directly
	                            // access the environment instead of using any helpers here to
	                            // ensure compatibility with tools with Webpack which will replace
	                            // this with a literal.
	                            // eslint-disable-next-line @inngest/internal/process-warn
	                            if (process.env.NODE_ENV !== "production") {
	                                scheme = "http";
	                            }
	                        }
	                        catch (err) {
	                            // no-op
	                        }
	                        baseUrl = `${scheme}://${baseUrl}`;
	                    }
	                    return new URL(c.req.url, baseUrl);
	                },
	                queryString: (key) => c.req.query(key),
	                headers: (key) => c.req.header(key),
	                method: () => c.req.method,
	                body: () => c.req.json(),
	                env: () => (0, adapter_1.env)(c),
	            };
	        } }));
	    return handler.createHandler();
	};
	exports.serve = serve;
	
} (hono));

// src/index.ts
function serve({ mastra, inngest }) {
  const wfs = mastra.vnext_getWorkflows();
  const functions = Object.values(wfs).flatMap((wf) => {
    if (wf instanceof InngestWorkflow) {
      wf.__registerMastra(mastra);
      return wf.getFunctions();
    }
    return [];
  });
  return hono.serve({
    client: inngest,
    functions
  });
}
var InngestRun = class extends Run {
  inngest;
  #mastra;
  constructor(params, inngest) {
    super(params);
    this.inngest = inngest;
    this.#mastra = params.mastra;
  }
  async getRuns(eventId) {
    const response = await fetch(`${this.inngest.apiBaseUrl}/v1/events/${eventId}/runs`, {
      headers: {
        Authorization: `Bearer ${process.env.INNGEST_SIGNING_KEY}`
      }
    });
    const json = await response.json();
    return json.data;
  }
  async getRunOutput(eventId) {
    let runs = await this.getRuns(eventId);
    while (runs?.[0]?.status !== "Completed") {
      await new Promise((resolve) => setTimeout(resolve, 1e3));
      runs = await this.getRuns(eventId);
      if (runs?.[0]?.status === "Failed" || runs?.[0]?.status === "Cancelled") {
        throw new Error(`Function run ${runs?.[0]?.status}`);
      }
    }
    return runs?.[0];
  }
  async start({
    inputData
  }) {
    await this.#mastra.getStorage()?.persistWorkflowSnapshot({
      workflowName: this.workflowId,
      runId: this.runId,
      snapshot: {
        runId: this.runId,
        value: {},
        context: {},
        activePaths: [],
        suspendedPaths: {},
        timestamp: Date.now()
      }
    });
    const eventOutput = await this.inngest.send({
      name: `workflow.${this.workflowId}`,
      data: {
        inputData,
        runId: this.runId
      }
    });
    const eventId = eventOutput.ids[0];
    if (!eventId) {
      throw new Error("Event ID is not set");
    }
    const runOutput = await this.getRunOutput(eventId);
    const result = runOutput?.output?.result;
    if (result.status === "failed") {
      result.error = new Error(result.error);
    }
    this.cleanup?.();
    return result;
  }
  async resume(params) {
    const steps = (Array.isArray(params.step) ? params.step : [params.step]).map(
      (step) => typeof step === "string" ? step : step?.id
    );
    const snapshot = await this.#mastra?.storage?.loadWorkflowSnapshot({
      workflowName: this.workflowId,
      runId: this.runId
    });
    const eventOutput = await this.inngest.send({
      name: `workflow.${this.workflowId}`,
      data: {
        inputData: params.resumeData,
        runId: this.runId,
        stepResults: snapshot?.context,
        resume: {
          steps,
          stepResults: snapshot?.context,
          resumePayload: params.resumeData,
          // @ts-ignore
          resumePath: snapshot?.suspendedPaths?.[steps?.[0]]
        }
      }
    });
    const eventId = eventOutput.ids[0];
    if (!eventId) {
      throw new Error("Event ID is not set");
    }
    const runOutput = await this.getRunOutput(eventId);
    const result = runOutput?.output?.result;
    if (result.status === "failed") {
      result.error = new Error(result.error);
    }
    return result;
  }
  watch(cb) {
    const streamPromise = dist.subscribe(
      {
        channel: `workflow:${this.workflowId}:${this.runId}`,
        topics: ["watch"],
        app: this.inngest
      },
      (message) => {
        cb(message.data);
      }
    );
    return () => {
      streamPromise.then((stream) => {
        stream.cancel();
      }).catch((err) => {
        console.error(err);
      });
    };
  }
};
var InngestWorkflow = class _InngestWorkflow extends NewWorkflow {
  #mastra;
  inngest;
  function;
  constructor(params, inngest) {
    super(params);
    this.#mastra = params.mastra;
    this.inngest = inngest;
  }
  async getWorkflowRuns(args) {
    const storage = this.#mastra?.getStorage();
    if (!storage) {
      this.logger.debug("Cannot get workflow runs. Mastra engine is not initialized");
      return { runs: [], total: 0 };
    }
    return storage.getWorkflowRuns({ workflowName: this.id, ...args ?? {} });
  }
  async getWorkflowRunById(runId) {
    const storage = this.#mastra?.getStorage();
    if (!storage) {
      this.logger.debug("Cannot get workflow runs. Mastra engine is not initialized");
      return null;
    }
    const run = await storage.getWorkflowRunById({ runId, workflowName: this.id });
    return run ?? (this.runs.get(runId) ? { ...this.runs.get(runId), workflowName: this.id } : null);
  }
  __registerMastra(mastra) {
    this.#mastra = mastra;
    this.executionEngine.__registerMastra(mastra);
    const updateNested = (step) => {
      if ((step.type === "step" || step.type === "loop" || step.type === "foreach") && step.step instanceof _InngestWorkflow) {
        step.step.__registerMastra(mastra);
      } else if (step.type === "parallel" || step.type === "conditional") {
        for (const subStep of step.steps) {
          updateNested(subStep);
        }
      }
    };
    if (this.executionGraph.steps.length) {
      for (const step of this.executionGraph.steps) {
        updateNested(step);
      }
    }
  }
  createRun(options) {
    const runIdToUse = options?.runId || randomUUID();
    const run = this.runs.get(runIdToUse) ?? new InngestRun(
      {
        workflowId: this.id,
        runId: runIdToUse,
        executionEngine: this.executionEngine,
        executionGraph: this.executionGraph,
        mastra: this.#mastra,
        retryConfig: this.retryConfig,
        cleanup: () => this.runs.delete(runIdToUse)
      },
      this.inngest
    );
    this.runs.set(runIdToUse, run);
    return run;
  }
  getFunction() {
    if (this.function) {
      return this.function;
    }
    this.function = this.inngest.createFunction(
      // @ts-ignore
      { id: `workflow.${this.id}`, retries: this.retryConfig?.attempts ?? 0 },
      { event: `workflow.${this.id}` },
      async ({ event, step, attempt, publish }) => {
        let { inputData, runId, resume } = event.data;
        if (!runId) {
          runId = await step.run(`workflow.${this.id}.runIdGen`, async () => {
            return randomUUID();
          });
        }
        const emitter = {
          emit: async (event2, data) => {
            if (!publish) {
              return;
            }
            try {
              await publish({
                channel: `workflow:${this.id}:${runId}`,
                topic: "watch",
                data
              });
            } catch (err) {
              this.logger.error("Error emitting event: " + (err?.stack ?? err?.message ?? err));
            }
          }
        };
        const engine = new InngestExecutionEngine(this.#mastra, step, attempt);
        const result = await engine.execute({
          workflowId: this.id,
          runId,
          graph: this.executionGraph,
          input: inputData,
          emitter,
          retryConfig: this.retryConfig,
          runtimeContext: new RuntimeContext(),
          // TODO
          resume
        });
        return { result, runId };
      }
    );
    return this.function;
  }
  getNestedFunctions(steps) {
    return steps.flatMap((step) => {
      if (step.type === "step" || step.type === "loop" || step.type === "foreach") {
        if (step.step instanceof _InngestWorkflow) {
          return [step.step.getFunction(), ...step.step.getNestedFunctions(step.step.executionGraph.steps)];
        }
        return [];
      } else if (step.type === "parallel" || step.type === "conditional") {
        return this.getNestedFunctions(step.steps);
      }
      return [];
    });
  }
  getFunctions() {
    return [this.getFunction(), ...this.getNestedFunctions(this.executionGraph.steps)];
  }
};
var InngestExecutionEngine = class extends DefaultExecutionEngine {
  inngestStep;
  inngestAttempts;
  constructor(mastra, inngestStep, inngestAttempts = 0) {
    super({ mastra });
    this.inngestStep = inngestStep;
    this.inngestAttempts = inngestAttempts;
  }
  async fmtReturnValue(executionSpan, emitter, stepResults, lastOutput, error) {
    const base = {
      status: lastOutput.status,
      steps: stepResults
    };
    if (lastOutput.status === "success") {
      await emitter.emit("watch", {
        type: "watch",
        payload: {
          workflowState: {
            status: lastOutput.status,
            steps: stepResults,
            result: lastOutput.output
          }
        },
        eventTimestamp: Date.now()
      });
      base.result = lastOutput.output;
    } else if (lastOutput.status === "failed") {
      base.error = error instanceof Error ? error?.stack ?? error.message : lastOutput?.error instanceof Error ? lastOutput.error.message : lastOutput.error ?? error ?? "Unknown error";
      await emitter.emit("watch", {
        type: "watch",
        payload: {
          workflowState: {
            status: lastOutput.status,
            steps: stepResults,
            result: null,
            error: base.error
          }
        },
        eventTimestamp: Date.now()
      });
    } else if (lastOutput.status === "suspended") {
      await emitter.emit("watch", {
        type: "watch",
        payload: {
          workflowState: {
            status: lastOutput.status,
            steps: stepResults,
            result: null,
            error: null
          }
        },
        eventTimestamp: Date.now()
      });
      const suspendedStepIds = Object.entries(stepResults).flatMap(([stepId, stepResult]) => {
        if (stepResult?.status === "suspended") {
          const nestedPath = stepResult?.payload?.__workflow_meta?.path;
          return nestedPath ? [[stepId, ...nestedPath]] : [[stepId]];
        }
        return [];
      });
      base.suspended = suspendedStepIds;
    }
    executionSpan?.end();
    return base;
  }
  async superExecuteStep({
    workflowId,
    runId,
    step,
    stepResults,
    executionContext,
    resume,
    prevOutput,
    emitter,
    runtimeContext
  }) {
    return super.executeStep({
      workflowId,
      runId,
      step,
      stepResults,
      executionContext,
      resume,
      prevOutput,
      emitter,
      runtimeContext
    });
  }
  async executeStep({
    step,
    stepResults,
    executionContext,
    resume,
    prevOutput,
    emitter,
    runtimeContext
  }) {
    await this.inngestStep.run(
      `workflow.${executionContext.workflowId}.run.${executionContext.runId}.step.${step.id}.running_ev`,
      async () => {
        await emitter.emit("watch", {
          type: "watch",
          payload: {
            currentStep: {
              id: step.id,
              status: "running"
            },
            workflowState: {
              status: "running",
              steps: {
                ...stepResults,
                [step.id]: {
                  status: "running"
                }
              },
              result: null,
              error: null
            }
          },
          eventTimestamp: Date.now()
        });
      }
    );
    if (step instanceof InngestWorkflow) {
      const isResume = !!resume?.steps?.length;
      let result;
      let runId;
      if (isResume) {
        runId = stepResults[resume?.steps?.[0]]?.payload?.__workflow_meta?.runId ?? randomUUID();
        const snapshot = await this.mastra?.getStorage()?.loadWorkflowSnapshot({
          workflowName: step.id,
          runId
        });
        const invokeResp = await this.inngestStep.invoke(`workflow.${executionContext.workflowId}.step.${step.id}`, {
          function: step.getFunction(),
          data: {
            inputData: prevOutput,
            runId,
            resume: {
              runId,
              steps: resume.steps.slice(1),
              stepResults: snapshot?.context,
              resumePayload: resume.resumePayload,
              // @ts-ignore
              resumePath: snapshot?.suspendedPaths?.[resume.steps?.[1]]
            }
          }
        });
        result = invokeResp.result;
        runId = invokeResp.runId;
      } else {
        const invokeResp = await this.inngestStep.invoke(`workflow.${executionContext.workflowId}.step.${step.id}`, {
          function: step.getFunction(),
          data: {
            inputData: prevOutput
          }
        });
        result = invokeResp.result;
        runId = invokeResp.runId;
      }
      const res = await this.inngestStep.run(
        `workflow.${executionContext.workflowId}.step.${step.id}.nestedwf-results`,
        async () => {
          if (result.status === "failed") {
            await emitter.emit("watch", {
              type: "watch",
              payload: {
                currentStep: {
                  id: step.id,
                  status: "failed",
                  error: result?.error
                },
                workflowState: {
                  status: "running",
                  steps: stepResults,
                  result: null,
                  error: null
                }
              },
              eventTimestamp: Date.now()
            });
            return { executionContext, result: { status: "failed", error: result?.error } };
          } else if (result.status === "suspended") {
            const suspendedSteps = Object.entries(result.steps).filter(([_stepName, stepResult]) => {
              const stepRes2 = stepResult;
              return stepRes2?.status === "suspended";
            });
            for (const [stepName, stepResult] of suspendedSteps) {
              const suspendPath = [stepName, ...stepResult?.payload?.__workflow_meta?.path ?? []];
              executionContext.suspendedPaths[step.id] = executionContext.executionPath;
              await emitter.emit("watch", {
                type: "watch",
                payload: {
                  currentStep: {
                    id: step.id,
                    status: "suspended",
                    payload: { ...stepResult?.payload, __workflow_meta: { runId, path: suspendPath } }
                  },
                  workflowState: {
                    status: "running",
                    steps: stepResults,
                    result: null,
                    error: null
                  }
                },
                eventTimestamp: Date.now()
              });
              return {
                executionContext,
                result: {
                  status: "suspended",
                  payload: { ...stepResult?.payload, __workflow_meta: { runId, path: suspendPath } }
                }
              };
            }
            await emitter.emit("watch", {
              type: "watch",
              payload: {
                currentStep: {
                  id: step.id,
                  status: "suspended",
                  payload: {}
                },
                workflowState: {
                  status: "running",
                  steps: stepResults,
                  result: null,
                  error: null
                }
              },
              eventTimestamp: Date.now()
            });
            return {
              executionContext,
              result: {
                status: "suspended",
                payload: {}
              }
            };
          }
          await emitter.emit("watch", {
            type: "watch",
            payload: {
              currentStep: {
                id: step.id,
                status: "success",
                output: result?.result
              },
              workflowState: {
                status: "running",
                steps: stepResults,
                result: null,
                error: null
              }
            },
            eventTimestamp: Date.now()
          });
          return { executionContext, result: { status: "success", output: result?.result } };
        }
      );
      Object.assign(executionContext, res.executionContext);
      return res.result;
    }
    const stepRes = await this.inngestStep.run(`workflow.${executionContext.workflowId}.step.${step.id}`, async () => {
      let execResults;
      let suspended;
      try {
        const result = await step.execute({
          mastra: this.mastra,
          runtimeContext,
          inputData: prevOutput,
          resumeData: resume?.steps[0] === step.id ? resume?.resumePayload : void 0,
          getInitData: () => stepResults?.input,
          getStepResult: (step2) => {
            const result2 = stepResults[step2.id];
            if (result2?.status === "success") {
              return result2.output;
            }
            return null;
          },
          suspend: async (suspendPayload) => {
            executionContext.suspendedPaths[step.id] = executionContext.executionPath;
            suspended = { payload: suspendPayload };
          },
          resume: {
            steps: resume?.steps?.slice(1) || [],
            resumePayload: resume?.resumePayload,
            // @ts-ignore
            runId: stepResults[step.id]?.payload?.__workflow_meta?.runId
          },
          emitter
        });
        execResults = { status: "success", output: result };
      } catch (e) {
        execResults = { status: "failed", error: e instanceof Error ? e.message : String(e) };
      }
      if (suspended) {
        execResults = { status: "suspended", payload: suspended.payload };
      }
      if (execResults.status === "failed") {
        if (executionContext.retryConfig.attempts > 0 && this.inngestAttempts < executionContext.retryConfig.attempts) {
          throw execResults.error;
        }
      }
      await emitter.emit("watch", {
        type: "watch",
        payload: {
          currentStep: {
            id: step.id,
            status: execResults.status,
            output: execResults.output
          },
          workflowState: {
            status: "running",
            steps: stepResults,
            result: null,
            error: null
          }
        },
        eventTimestamp: Date.now()
      });
      return { result: execResults, executionContext, stepResults };
    });
    Object.assign(executionContext.suspendedPaths, stepRes.executionContext.suspendedPaths);
    Object.assign(stepResults, stepRes.stepResults);
    return stepRes.result;
  }
  async persistStepUpdate({
    workflowId,
    runId,
    stepResults,
    executionContext
  }) {
    await this.inngestStep.run(
      `workflow.${workflowId}.run.${runId}.path.${JSON.stringify(executionContext.executionPath)}.stepUpdate`,
      async () => {
        await this.mastra?.getStorage()?.persistWorkflowSnapshot({
          workflowName: workflowId,
          runId,
          snapshot: {
            runId,
            value: {},
            context: stepResults,
            activePaths: [],
            suspendedPaths: executionContext.suspendedPaths,
            // @ts-ignore
            timestamp: Date.now()
          }
        });
      }
    );
  }
  async executeConditional({
    workflowId,
    runId,
    entry,
    prevOutput,
    prevStep,
    stepResults,
    resume,
    executionContext,
    emitter,
    runtimeContext
  }) {
    let execResults;
    const truthyIndexes = (await Promise.all(
      entry.conditions.map(
        (cond, index) => this.inngestStep.run(`workflow.${workflowId}.conditional.${index}`, async () => {
          try {
            const result = await cond({
              mastra: this.mastra,
              runtimeContext,
              inputData: prevOutput,
              getInitData: () => stepResults?.input,
              getStepResult: (step) => {
                if (!step?.id) {
                  return null;
                }
                const result2 = stepResults[step.id];
                if (result2?.status === "success") {
                  return result2.output;
                }
                return null;
              },
              // TODO: this function shouldn't have suspend probably?
              suspend: async (_suspendPayload) => {
              },
              emitter
            });
            return result ? index : null;
          } catch (e) {
            return null;
          }
        })
      )
    )).filter((index) => index !== null);
    const stepsToRun = entry.steps.filter((_, index) => truthyIndexes.includes(index));
    const results = await Promise.all(
      stepsToRun.map(
        (step, index) => this.executeEntry({
          workflowId,
          runId,
          entry: step,
          prevStep,
          stepResults,
          resume,
          executionContext: {
            workflowId,
            runId,
            executionPath: [...executionContext.executionPath, index],
            suspendedPaths: executionContext.suspendedPaths,
            retryConfig: executionContext.retryConfig,
            executionSpan: executionContext.executionSpan
          },
          emitter,
          runtimeContext
        })
      )
    );
    const hasFailed = results.find((result) => result.status === "failed");
    const hasSuspended = results.find((result) => result.status === "suspended");
    if (hasFailed) {
      execResults = { status: "failed", error: hasFailed.error };
    } else if (hasSuspended) {
      execResults = { status: "suspended", payload: hasSuspended.payload };
    } else {
      execResults = {
        status: "success",
        output: results.reduce((acc, result, index) => {
          if (result.status === "success") {
            acc[stepsToRun[index].step.id] = result.output;
          }
          return acc;
        }, {})
      };
    }
    return execResults;
  }
};

export { serve };
