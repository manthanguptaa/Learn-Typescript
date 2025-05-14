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
const vNext_1 = require("@mastra/core/workflows/vNext");
const zod_1 = require("zod");
const incrementStep = (0, vNext_1.createStep)({
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
const sideEffectStep = (0, vNext_1.createStep)({
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
const finalStep = (0, vNext_1.createStep)({
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
const workflow = (0, vNext_1.createWorkflow)({
    id: 'increment-workflow',
    inputSchema: zod_1.z.object({
        value: zod_1.z.number(),
    }),
    outputSchema: zod_1.z.object({
        value: zod_1.z.number(),
    }),
})
    .dountil((0, vNext_1.createWorkflow)({
    id: 'increment-workflow',
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
