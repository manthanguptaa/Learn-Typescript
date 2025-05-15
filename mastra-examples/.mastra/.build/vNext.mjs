import { Agent } from './@mastra-core-agent.mjs';
import { T as Tool } from './utils.mjs';
import { RuntimeContext } from './@mastra-core-runtime-context.mjs';
import { M as MastraBase } from './chunk-235X76GC.mjs';
import { R as RegisteredLogger } from './logger.mjs';
import { randomUUID } from 'crypto';
import require$$2 from 'events';
import { l as lib } from './_virtual__virtual-zod.mjs';
import { c as context } from './core.mjs';
import { t as trace } from './trace-api.mjs';

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
function createWorkflow(params) {
  return new NewWorkflow(params);
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

export { DefaultExecutionEngine as D, NewWorkflow as N, Run as R, createStep as a, createWorkflow as c };
