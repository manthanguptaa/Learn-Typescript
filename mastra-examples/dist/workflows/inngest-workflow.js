"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.incrementWorkflow = void 0;
const inngest_1 = require("@mastra/inngest");
const inngest_2 = require("inngest");
const zod_1 = require("zod");
const { createWorkflow, createStep } = (0, inngest_1.init)(new inngest_2.Inngest({
    id: 'mastra',
    baseUrl: `http://localhost:8288`,
}));
const incrementStep = createStep({
    id: 'increment',
    inputSchema: zod_1.z.object({
        value: zod_1.z.number(),
    }),
    outputSchema: zod_1.z.object({
        value: zod_1.z.number(),
    }),
    execute: (_a) => __awaiter(void 0, [_a], void 0, function* ({ inputData }) {
        return { value: inputData.value + 1 };
    }),
});
const sideEffectStep = createStep({
    id: 'side-effect',
    inputSchema: zod_1.z.object({
        value: zod_1.z.number(),
    }),
    outputSchema: zod_1.z.object({
        value: zod_1.z.number(),
    }),
    execute: (_a) => __awaiter(void 0, [_a], void 0, function* ({ inputData }) {
        console.log('log', inputData.value);
        return { value: inputData.value };
    }),
});
const finalStep = createStep({
    id: 'final',
    inputSchema: zod_1.z.object({
        value: zod_1.z.number(),
    }),
    outputSchema: zod_1.z.object({
        value: zod_1.z.number(),
    }),
    execute: (_a) => __awaiter(void 0, [_a], void 0, function* ({ inputData }) {
        return { value: inputData.value };
    }),
});
const workflow = createWorkflow({
    id: 'increment-workflow',
    inputSchema: zod_1.z.object({
        value: zod_1.z.number(),
    }),
    outputSchema: zod_1.z.object({
        value: zod_1.z.number(),
    }),
})
    .dountil(createWorkflow({
    id: 'increment-subworkflow',
    inputSchema: zod_1.z.object({
        value: zod_1.z.number(),
    }),
    outputSchema: zod_1.z.object({
        value: zod_1.z.number(),
    }),
    steps: [incrementStep, sideEffectStep],
})
    .then(incrementStep)
    .then(sideEffectStep)
    .commit(), (_a) => __awaiter(void 0, [_a], void 0, function* ({ inputData }) { return inputData.value >= 10; }))
    .then(finalStep);
exports.incrementWorkflow = workflow;
workflow.commit();
