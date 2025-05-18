import { randomUUID } from 'crypto';
import { d as dist } from './realtime.mjs';
import { Agent } from './@mastra-core-agent.mjs';
import { T as Tool } from './utils.mjs';
import { RuntimeContext } from './@mastra-core-runtime-context.mjs';
import { M as MastraBase } from './chunk-235X76GC.mjs';
import { R as RegisteredLogger } from './logger.mjs';
import require$$2 from 'events';
import { l as lib } from './_virtual__virtual-zod.mjs';
import { c as context } from './core.mjs';
import { t as trace } from './trace-api.mjs';
import { g as getAugmentedNamespace } from './_commonjsHelpers.mjs';
import { I as InngestCommHandler } from './_virtual__virtual-inngest.mjs';

// src/workflows/vNext/execution-engine.ts
var ExecutionEngine = class extends MastraBase {
  mastra;
  constructor({ mastra }) {
    super({ name: "ExecutionEngine", component: RegisteredLogger.WORKFLOW });
    this.mastra = mastra;
  }
  __registerMastra(mastra) {
    this.mastra = mastra;
  }
};

// src/workflows/vNext/default.ts
var DefaultExecutionEngine = class extends ExecutionEngine {
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
      await emitter.emit("watch", {
        type: "watch",
        payload: {
          workflowState: {
            status: lastOutput.status,
            steps: stepResults,
            result: null,
            error: lastOutput.error
          }
        },
        eventTimestamp: Date.now()
      });
      base.error = error instanceof Error ? error : lastOutput.error ?? new Error("Unknown error: " + error);
    } else if (lastOutput.status === "suspended") {
      const suspendedStepIds = Object.entries(stepResults).flatMap(([stepId, stepResult]) => {
        if (stepResult?.status === "suspended") {
          const nestedPath = stepResult?.payload?.__workflow_meta?.path;
          return nestedPath ? [[stepId, ...nestedPath]] : [[stepId]];
        }
        return [];
      });
      base.suspended = suspendedStepIds;
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
    }
    executionSpan?.end();
    return base;
  }
  /**
   * Executes a workflow run with the provided execution graph and input
   * @param graph The execution graph to execute
   * @param input The input data for the workflow
   * @returns A promise that resolves to the workflow output
   */
  async execute(params) {
    const { workflowId, runId, graph, input, resume, retryConfig } = params;
    const { attempts = 0, delay = 0 } = retryConfig ?? {};
    const steps = graph.steps;
    if (steps.length === 0) {
      throw new Error("Workflow must have at least one step");
    }
    const executionSpan = this.mastra?.getTelemetry()?.tracer.startSpan(`workflow.${workflowId}.execute`, {
      attributes: { componentName: workflowId, runId }
    });
    await this.mastra?.getStorage()?.init();
    let startIdx = 0;
    if (resume?.resumePath) {
      startIdx = resume.resumePath[0];
      resume.resumePath.shift();
    }
    const stepResults = resume?.stepResults || { input };
    let lastOutput;
    for (let i = startIdx; i < steps.length; i++) {
      const entry = steps[i];
      try {
        lastOutput = await this.executeEntry({
          workflowId,
          runId,
          entry,
          prevStep: steps[i - 1],
          stepResults,
          resume,
          executionContext: {
            workflowId,
            runId,
            executionPath: [i],
            suspendedPaths: {},
            retryConfig: { attempts, delay },
            executionSpan
          },
          emitter: params.emitter,
          runtimeContext: params.runtimeContext
        });
        if (lastOutput.status !== "success") {
          return this.fmtReturnValue(executionSpan, params.emitter, stepResults, lastOutput);
        }
      } catch (e) {
        this.logger.error("Error executing step: " + (e?.stack ?? e));
        return this.fmtReturnValue(executionSpan, params.emitter, stepResults, lastOutput, e);
      }
    }
    return this.fmtReturnValue(executionSpan, params.emitter, stepResults, lastOutput);
  }
  getStepOutput(stepResults, step) {
    if (!step) {
      return stepResults.input;
    } else if (step.type === "step") {
      return stepResults[step.step.id]?.output;
    } else if (step.type === "parallel" || step.type === "conditional") {
      return step.steps.reduce(
        (acc, entry) => {
          if (entry.type === "step") {
            acc[entry.step.id] = stepResults[entry.step.id]?.output;
          } else if (entry.type === "parallel" || entry.type === "conditional") {
            const parallelResult = this.getStepOutput(stepResults, entry)?.output;
            acc = { ...acc, ...parallelResult };
          } else if (entry.type === "loop") {
            acc[entry.step.id] = stepResults[entry.step.id]?.output;
          } else if (entry.type === "foreach") {
            acc[entry.step.id] = stepResults[entry.step.id]?.output;
          }
          return acc;
        },
        {}
      );
    } else if (step.type === "loop") {
      return stepResults[step.step.id]?.output;
    } else if (step.type === "foreach") {
      return stepResults[step.step.id]?.output;
    }
  }
  async executeStep({
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
    const _runStep = (step2, spanName, attributes) => {
      return async (data) => {
        const telemetry = this.mastra?.getTelemetry();
        const span = executionContext.executionSpan;
        if (!telemetry || !span) {
          return step2.execute(data);
        }
        return context.with(trace.setSpan(context.active(), span), async () => {
          return telemetry.traceMethod(step2.execute.bind(step2), {
            spanName,
            attributes
          })(data);
        });
      };
    };
    const runStep = _runStep(step, `workflow.${workflowId}.step.${step.id}`, {
      componentName: workflowId,
      runId
    });
    let execResults;
    const retries = step.retries ?? executionContext.retryConfig.attempts ?? 0;
    for (let i = 0; i < retries + 1; i++) {
      try {
        let suspended;
        const result = await runStep({
          mastra: this.mastra,
          runtimeContext,
          inputData: prevOutput,
          resumeData: resume?.steps[0] === step.id ? resume?.resumePayload : void 0,
          getInitData: () => stepResults?.input,
          getStepResult: (step2) => {
            if (!step2?.id) {
              return null;
            }
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
        if (suspended) {
          execResults = { status: "suspended", payload: suspended.payload };
        } else {
          execResults = { status: "success", output: result };
        }
        break;
      } catch (e) {
        this.logger.error("Error executing step: " + (e?.stack ?? e));
        execResults = { status: "failed", error: e instanceof Error ? e : new Error("Unknown error: " + e) };
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
          steps: {
            ...stepResults,
            [step.id]: {
              status: execResults.status,
              output: execResults.output,
              error: execResults.error,
              payload: execResults.payload
            }
          },
          result: null,
          error: null
        }
      },
      eventTimestamp: Date.now()
    });
    return execResults;
  }
  async executeParallel({
    workflowId,
    runId,
    entry,
    prevStep,
    stepResults,
    resume,
    executionContext,
    emitter,
    runtimeContext
  }) {
    let execResults;
    const results = await Promise.all(
      entry.steps.map(
        (step, i) => this.executeEntry({
          workflowId,
          runId,
          entry: step,
          prevStep,
          stepResults,
          resume,
          executionContext: {
            workflowId,
            runId,
            executionPath: [...executionContext.executionPath, i],
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
            acc[entry.steps[index].step.id] = result.output;
          }
          return acc;
        }, {})
      };
    }
    return execResults;
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
      entry.conditions.map(async (cond, index) => {
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
          this.logger.error("Error evaluating condition: " + (e?.stack ?? e));
          return null;
        }
      })
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
  async executeLoop({
    workflowId,
    runId,
    entry,
    prevOutput,
    stepResults,
    resume,
    executionContext,
    emitter,
    runtimeContext
  }) {
    const { step, condition } = entry;
    let isTrue = true;
    let result = { status: "success", output: prevOutput };
    do {
      result = await this.executeStep({
        workflowId,
        runId,
        step,
        stepResults,
        executionContext,
        resume,
        prevOutput: result.output,
        emitter,
        runtimeContext
      });
      if (result.status !== "success") {
        return result;
      }
      isTrue = await condition({
        mastra: this.mastra,
        runtimeContext,
        inputData: result.output,
        getInitData: () => stepResults?.input,
        getStepResult: (step2) => {
          if (!step2?.id) {
            return null;
          }
          const result2 = stepResults[step2.id];
          return result2?.status === "success" ? result2.output : null;
        },
        suspend: async (_suspendPayload) => {
        },
        emitter
      });
    } while (entry.loopType === "dowhile" ? isTrue : !isTrue);
    return result;
  }
  async executeForeach({
    workflowId,
    runId,
    entry,
    prevOutput,
    stepResults,
    resume,
    executionContext,
    emitter,
    runtimeContext
  }) {
    const { step, opts } = entry;
    const results = [];
    const concurrency = opts.concurrency;
    for (let i = 0; i < prevOutput.length; i += concurrency) {
      const items = prevOutput.slice(i, i + concurrency);
      const itemsResults = await Promise.all(
        items.map((item) => {
          return this.executeStep({
            workflowId,
            runId,
            step,
            stepResults,
            executionContext,
            resume,
            prevOutput: item,
            emitter,
            runtimeContext
          });
        })
      );
      for (const result of itemsResults) {
        if (result.status !== "success") {
          return result;
        }
        results.push(result?.output);
      }
    }
    return { status: "success", output: results };
  }
  async persistStepUpdate({
    workflowId,
    runId,
    stepResults,
    executionContext
  }) {
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
  async executeEntry({
    workflowId,
    runId,
    entry,
    prevStep,
    stepResults,
    resume,
    executionContext,
    emitter,
    runtimeContext
  }) {
    const prevOutput = this.getStepOutput(stepResults, prevStep);
    let execResults;
    if (entry.type === "step") {
      const { step } = entry;
      execResults = await this.executeStep({
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
    } else if (resume?.resumePath?.length && (entry.type === "parallel" || entry.type === "conditional")) {
      const idx = resume.resumePath.shift();
      return this.executeEntry({
        workflowId,
        runId,
        entry: entry.steps[idx],
        prevStep,
        stepResults,
        resume,
        executionContext: {
          workflowId,
          runId,
          executionPath: [...executionContext.executionPath, idx],
          suspendedPaths: executionContext.suspendedPaths,
          retryConfig: executionContext.retryConfig,
          executionSpan: executionContext.executionSpan
        },
        emitter,
        runtimeContext
      });
    } else if (entry.type === "parallel") {
      execResults = await this.executeParallel({
        workflowId,
        runId,
        entry,
        prevStep,
        stepResults,
        resume,
        executionContext,
        emitter,
        runtimeContext
      });
    } else if (entry.type === "conditional") {
      execResults = await this.executeConditional({
        workflowId,
        runId,
        entry,
        prevStep,
        prevOutput,
        stepResults,
        resume,
        executionContext,
        emitter,
        runtimeContext
      });
    } else if (entry.type === "loop") {
      execResults = await this.executeLoop({
        workflowId,
        runId,
        entry,
        prevStep,
        prevOutput,
        stepResults,
        resume,
        executionContext,
        emitter,
        runtimeContext
      });
    } else if (entry.type === "foreach") {
      execResults = await this.executeForeach({
        workflowId,
        runId,
        entry,
        prevStep,
        prevOutput,
        stepResults,
        resume,
        executionContext,
        emitter,
        runtimeContext
      });
    }
    if (entry.type === "step" || entry.type === "loop" || entry.type === "foreach") {
      stepResults[entry.step.id] = execResults;
    }
    await this.persistStepUpdate({
      workflowId,
      runId,
      stepResults,
      executionContext
    });
    return execResults;
  }
};

// src/workflows/vNext/workflow.ts
function createStep(params) {
  if (params instanceof Agent) {
    return {
      id: params.name,
      // @ts-ignore
      inputSchema: lib.z.object({
        prompt: lib.z.string()
        // resourceId: z.string().optional(),
        // threadId: z.string().optional(),
      }),
      // @ts-ignore
      outputSchema: lib.z.object({
        text: lib.z.string()
      }),
      execute: async ({ inputData }) => {
        const result = await params.generate(inputData.prompt, {
          // resourceId: inputData.resourceId,
          // threadId: inputData.threadId,
        });
        return {
          text: result.text
        };
      }
    };
  }
  if (params instanceof Tool) {
    if (!params.inputSchema || !params.outputSchema) {
      throw new Error("Tool must have input and output schemas defined");
    }
    return {
      // TODO: tool probably should have strong id type
      // @ts-ignore
      id: params.id,
      inputSchema: params.inputSchema,
      outputSchema: params.outputSchema,
      execute: async ({ inputData, mastra }) => {
        return await params.execute({
          context: inputData,
          mastra
        });
      }
    };
  }
  return {
    id: params.id,
    description: params.description,
    inputSchema: params.inputSchema,
    outputSchema: params.outputSchema,
    resumeSchema: params.resumeSchema,
    suspendSchema: params.suspendSchema,
    execute: params.execute
  };
}
function cloneStep(step, opts) {
  return {
    id: opts.id,
    description: step.description,
    inputSchema: step.inputSchema,
    outputSchema: step.outputSchema,
    execute: step.execute
  };
}
var NewWorkflow = class extends MastraBase {
  id;
  description;
  inputSchema;
  outputSchema;
  steps;
  stepDefs;
  stepFlow;
  serializedStepFlow;
  executionEngine;
  executionGraph;
  retryConfig;
  #mastra;
  #runs = /* @__PURE__ */ new Map();
  constructor({
    mastra,
    id,
    inputSchema,
    outputSchema,
    description,
    executionEngine,
    retryConfig,
    steps
  }) {
    super({ name: id, component: RegisteredLogger.WORKFLOW });
    this.id = id;
    this.description = description;
    this.inputSchema = inputSchema;
    this.outputSchema = outputSchema;
    this.retryConfig = retryConfig ?? { attempts: 0, delay: 0 };
    this.executionGraph = this.buildExecutionGraph();
    this.stepFlow = [];
    this.serializedStepFlow = [];
    this.#mastra = mastra;
    this.steps = {};
    this.stepDefs = steps;
    if (!executionEngine) {
      this.executionEngine = new DefaultExecutionEngine({ mastra: this.#mastra });
    } else {
      this.executionEngine = executionEngine;
    }
    this.#runs = /* @__PURE__ */ new Map();
  }
  get runs() {
    return this.#runs;
  }
  get mastra() {
    return this.#mastra;
  }
  __registerMastra(mastra) {
    this.#mastra = mastra;
    this.executionEngine.__registerMastra(mastra);
  }
  __registerPrimitives(p) {
    if (p.telemetry) {
      this.__setTelemetry(p.telemetry);
    }
    if (p.logger) {
      this.__setLogger(p.logger);
    }
  }
  setStepFlow(stepFlow) {
    this.stepFlow = stepFlow;
  }
  /**
   * Adds a step to the workflow
   * @param step The step to add to the workflow
   * @returns The workflow instance for chaining
   */
  then(step) {
    this.stepFlow.push({ type: "step", step });
    this.serializedStepFlow.push({
      type: "step",
      step: {
        id: step.id,
        description: step.description,
        component: step.component,
        serializedStepFlow: step.serializedStepFlow
      }
    });
    this.steps[step.id] = step;
    return this;
  }
  map(mappingConfig) {
    if (typeof mappingConfig === "function") {
      const mappingStep2 = createStep({
        id: `mapping_${randomUUID()}`,
        inputSchema: lib.z.object({}),
        outputSchema: lib.z.object({}),
        execute: mappingConfig
      });
      this.stepFlow.push({ type: "step", step: mappingStep2 });
      this.serializedStepFlow.push({
        type: "step",
        step: {
          id: mappingStep2.id,
          description: mappingStep2.description,
          component: mappingStep2.component,
          serializedStepFlow: mappingStep2.serializedStepFlow
        }
      });
      return this;
    }
    const mappingStep = createStep({
      id: `mapping_${randomUUID()}`,
      inputSchema: lib.z.object({}),
      outputSchema: lib.z.object({}),
      execute: async (ctx) => {
        const { getStepResult, getInitData, runtimeContext } = ctx;
        const result = {};
        for (const [key, mapping] of Object.entries(mappingConfig)) {
          const m = mapping;
          if (m.value !== void 0) {
            result[key] = m.value;
            continue;
          }
          if (m.fn !== void 0) {
            result[key] = await m.fn(ctx);
            continue;
          }
          if (m.runtimeContextPath) {
            result[key] = runtimeContext.get(m.runtimeContextPath);
            continue;
          }
          const stepResult = m.initData ? getInitData() : getStepResult(Array.isArray(m.step) ? m.step.find((s) => getStepResult(s)) : m.step);
          if (m.path === ".") {
            result[key] = stepResult;
            continue;
          }
          const pathParts = m.path.split(".");
          let value = stepResult;
          for (const part of pathParts) {
            if (typeof value === "object" && value !== null) {
              value = value[part];
            } else {
              throw new Error(`Invalid path ${m.path} in step ${m.step.id}`);
            }
          }
          result[key] = value;
        }
        return result;
      }
    });
    this.stepFlow.push({ type: "step", step: mappingStep });
    this.serializedStepFlow.push({
      type: "step",
      step: {
        id: mappingStep.id,
        description: mappingStep.description,
        component: mappingStep.component,
        serializedStepFlow: mappingStep.serializedStepFlow
      }
    });
    return this;
  }
  // TODO: make typing better here
  parallel(steps) {
    this.stepFlow.push({ type: "parallel", steps: steps.map((step) => ({ type: "step", step })) });
    this.serializedStepFlow.push({
      type: "parallel",
      steps: steps.map((step) => ({
        type: "step",
        step: {
          id: step.id,
          description: step.description,
          component: step.component,
          serializedStepFlow: step.serializedStepFlow
        }
      }))
    });
    steps.forEach((step) => {
      this.steps[step.id] = step;
    });
    return this;
  }
  // TODO: make typing better here
  branch(steps) {
    this.stepFlow.push({
      type: "conditional",
      steps: steps.map(([_cond, step]) => ({ type: "step", step })),
      conditions: steps.map(([cond]) => cond),
      serializedConditions: steps.map(([cond, _step]) => ({ id: `${_step.id}-condition`, fn: cond.toString() }))
    });
    this.serializedStepFlow.push({
      type: "conditional",
      steps: steps.map(([_cond, step]) => ({
        type: "step",
        step: {
          id: step.id,
          description: step.description,
          component: step.component,
          serializedStepFlow: step.serializedStepFlow
        }
      })),
      serializedConditions: steps.map(([cond, _step]) => ({ id: `${_step.id}-condition`, fn: cond.toString() }))
    });
    steps.forEach(([_, step]) => {
      this.steps[step.id] = step;
    });
    return this;
  }
  dowhile(step, condition) {
    this.stepFlow.push({
      type: "loop",
      step,
      condition,
      loopType: "dowhile",
      serializedCondition: { id: `${step.id}-condition`, fn: condition.toString() }
    });
    this.serializedStepFlow.push({
      type: "loop",
      step: {
        id: step.id,
        description: step.description,
        component: step.component,
        serializedStepFlow: step.serializedStepFlow
      },
      serializedCondition: { id: `${step.id}-condition`, fn: condition.toString() },
      loopType: "dowhile"
    });
    this.steps[step.id] = step;
    return this;
  }
  dountil(step, condition) {
    this.stepFlow.push({
      type: "loop",
      step,
      condition,
      loopType: "dountil",
      serializedCondition: { id: `${step.id}-condition`, fn: condition.toString() }
    });
    this.serializedStepFlow.push({
      type: "loop",
      step: {
        id: step.id,
        description: step.description,
        component: step.component,
        serializedStepFlow: step.serializedStepFlow
      },
      serializedCondition: { id: `${step.id}-condition`, fn: condition.toString() },
      loopType: "dountil"
    });
    this.steps[step.id] = step;
    return this;
  }
  foreach(step, opts) {
    this.stepFlow.push({ type: "foreach", step, opts: opts ?? { concurrency: 1 } });
    this.serializedStepFlow.push({
      type: "foreach",
      step: {
        id: step.id,
        description: step.description,
        component: step.component,
        serializedStepFlow: step.serializedStepFlow
      },
      opts: opts ?? { concurrency: 1 }
    });
    this.steps[step.id] = step;
    return this;
  }
  /**
   * Builds the execution graph for this workflow
   * @returns The execution graph that can be used to execute the workflow
   */
  buildExecutionGraph() {
    return {
      id: randomUUID(),
      steps: this.stepFlow
    };
  }
  /**
   * Finalizes the workflow definition and prepares it for execution
   * This method should be called after all steps have been added to the workflow
   * @returns A built workflow instance ready for execution
   */
  commit() {
    this.executionGraph = this.buildExecutionGraph();
    return this;
  }
  get stepGraph() {
    return this.stepFlow;
  }
  get serializedStepGraph() {
    return this.serializedStepFlow;
  }
  /**
   * Creates a new workflow run instance
   * @param options Optional configuration for the run
   * @returns A Run instance that can be used to execute the workflow
   */
  createRun(options) {
    if (this.stepFlow.length === 0) {
      throw new Error("Execution flow of workflow is not defined. Add steps to the workflow via .then(), .branch(), etc.");
    }
    if (!this.executionGraph.steps) {
      throw new Error("Uncommitted step flow changes detected. Call .commit() to register the steps.");
    }
    const runIdToUse = options?.runId || randomUUID();
    const run = this.#runs.get(runIdToUse) ?? new Run({
      workflowId: this.id,
      runId: runIdToUse,
      executionEngine: this.executionEngine,
      executionGraph: this.executionGraph,
      mastra: this.#mastra,
      retryConfig: this.retryConfig,
      cleanup: () => this.#runs.delete(runIdToUse)
    });
    this.#runs.set(runIdToUse, run);
    return run;
  }
  async execute({
    inputData,
    resumeData,
    suspend,
    resume,
    emitter,
    mastra
  }) {
    this.__registerMastra(mastra);
    const run = resume?.steps?.length ? this.createRun({ runId: resume.runId }) : this.createRun();
    const unwatch = run.watch((event) => {
      emitter.emit("nested-watch", { event, workflowId: this.id, runId: run.runId, isResume: !!resume?.steps?.length });
    });
    const res = resume?.steps?.length ? await run.resume({ resumeData, step: resume.steps }) : await run.start({ inputData });
    unwatch();
    const suspendedSteps = Object.entries(res.steps).filter(([_stepName, stepResult]) => {
      const stepRes = stepResult;
      return stepRes?.status === "suspended";
    });
    if (suspendedSteps?.length) {
      for (const [stepName, stepResult] of suspendedSteps) {
        const suspendPath = [stepName, ...stepResult?.payload?.__workflow_meta?.path ?? []];
        await suspend({
          ...stepResult?.payload,
          __workflow_meta: { runId: run.runId, path: suspendPath }
        });
      }
    }
    if (res.status === "failed") {
      throw res.error;
    }
    return res.status === "success" ? res.result : void 0;
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
    return run ?? (this.#runs.get(runId) ? { ...this.#runs.get(runId), workflowName: this.id } : null);
  }
};
var Run = class {
  emitter;
  /**
   * Unique identifier for this workflow
   */
  workflowId;
  /**
   * Unique identifier for this run
   */
  runId;
  /**
   * Internal state of the workflow run
   */
  state = {};
  /**
   * The execution engine for this run
   */
  executionEngine;
  /**
   * The execution graph for this run
   */
  executionGraph;
  /**
   * The storage for this run
   */
  #mastra;
  cleanup;
  retryConfig;
  constructor(params) {
    this.workflowId = params.workflowId;
    this.runId = params.runId;
    this.executionEngine = params.executionEngine;
    this.executionGraph = params.executionGraph;
    this.#mastra = params.mastra;
    this.emitter = new require$$2();
    this.retryConfig = params.retryConfig;
    this.cleanup = params.cleanup;
  }
  /**
   * Starts the workflow execution with the provided input
   * @param input The input data for the workflow
   * @returns A promise that resolves to the workflow output
   */
  async start({
    inputData,
    runtimeContext
  }) {
    const result = await this.executionEngine.execute({
      workflowId: this.workflowId,
      runId: this.runId,
      graph: this.executionGraph,
      input: inputData,
      emitter: {
        emit: (event, data) => {
          this.emitter.emit(event, data);
          return Promise.resolve();
        }
      },
      retryConfig: this.retryConfig,
      runtimeContext: runtimeContext ?? new RuntimeContext()
    });
    this.cleanup?.();
    return result;
  }
  watch(cb) {
    const watchCb = (event) => {
      this.updateState(event.payload);
      cb({ type: event.type, payload: this.getState(), eventTimestamp: event.eventTimestamp });
    };
    this.emitter.on("watch", watchCb);
    const nestedWatchCb = ({ event, workflowId }) => {
      try {
        const { type, payload, eventTimestamp } = event;
        const prefixedSteps = Object.fromEntries(
          Object.entries(payload?.workflowState?.steps ?? {}).map(([stepId, step]) => [
            `${this.workflowId}.${stepId}`,
            step
          ])
        );
        const newPayload = {
          currentStep: {
            ...payload?.currentStep,
            id: `${workflowId}.${payload?.currentStep?.id}`
          },
          workflowState: {
            steps: prefixedSteps
          }
        };
        this.updateState(newPayload);
        cb({ type, payload: this.getState(), eventTimestamp });
      } catch (e) {
        console.error(e);
      }
    };
    this.emitter.on("nested-watch", nestedWatchCb);
    return () => {
      this.emitter.off("watch", watchCb);
      this.emitter.off("nested-watch", nestedWatchCb);
    };
  }
  async resume(params) {
    const steps = (Array.isArray(params.step) ? params.step : [params.step]).map(
      (step) => typeof step === "string" ? step : step?.id
    );
    const snapshot = await this.#mastra?.storage?.loadWorkflowSnapshot({
      workflowName: this.workflowId,
      runId: this.runId
    });
    return this.executionEngine.execute({
      workflowId: this.workflowId,
      runId: this.runId,
      graph: this.executionGraph,
      input: params.resumeData,
      resume: {
        steps,
        stepResults: snapshot?.context,
        resumePayload: params.resumeData,
        // @ts-ignore
        resumePath: snapshot?.suspendedPaths?.[steps?.[0]]
      },
      emitter: {
        emit: (event, data) => {
          this.emitter.emit(event, data);
          return Promise.resolve();
        }
      },
      runtimeContext: params.runtimeContext ?? new RuntimeContext()
    });
  }
  /**
   * Returns the current state of the workflow run
   * @returns The current state of the workflow run
   */
  getState() {
    return this.state;
  }
  updateState(state) {
    if (state.currentStep) {
      this.state.currentStep = state.currentStep;
    } else if (state.workflowState?.status !== "running") {
      delete this.state.currentStep;
    }
    if (state.workflowState) {
      this.state.workflowState = deepMerge(this.state.workflowState ?? {}, state.workflowState ?? {});
    }
  }
};
function deepMerge(a, b) {
  if (!a || typeof a !== "object") return b;
  if (!b || typeof b !== "object") return a;
  const result = { ...a };
  for (const key in b) {
    if (b[key] === void 0) continue;
    if (b[key] !== null && typeof b[key] === "object") {
      const aVal = result[key];
      const bVal = b[key];
      if (Array.isArray(bVal)) {
        result[key] = Array.isArray(aVal) ? [...aVal, ...bVal].filter((item) => item !== void 0) : bVal.filter((item) => item !== void 0);
      } else if (typeof aVal === "object" && aVal !== null) {
        result[key] = deepMerge(aVal, bVal);
      } else {
        result[key] = bVal;
      }
    } else {
      result[key] = b[key];
    }
  }
  return result;
}

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
function cloneWorkflow(workflow, opts) {
  const wf = new InngestWorkflow(
    {
      id: opts.id,
      inputSchema: workflow.inputSchema,
      outputSchema: workflow.outputSchema,
      steps: workflow.stepDefs,
      mastra: workflow.mastra
    },
    workflow.inngest
  );
  wf.setStepFlow(workflow.stepGraph);
  wf.commit();
  return wf;
}
function init(inngest) {
  return {
    createWorkflow(params) {
      return new InngestWorkflow(params, inngest);
    },
    createStep,
    cloneStep,
    cloneWorkflow
  };
}
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

export { init, serve };
