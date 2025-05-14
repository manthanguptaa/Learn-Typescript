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
exports.humanInputStep = exports.travelAgentWorkflow = void 0;
const vNext_1 = require("@mastra/core/workflows/vNext");
const zod_1 = require("zod");
const generateSuggestionsStep = (0, vNext_1.createStep)({
    id: 'generate-suggestions',
    inputSchema: zod_1.z.object({
        vacationDescription: zod_1.z.string().describe('The description of the vacation'),
    }),
    outputSchema: zod_1.z.object({
        suggestions: zod_1.z.array(zod_1.z.string()),
        vacationDescription: zod_1.z.string(),
    }),
    execute: (_a) => __awaiter(void 0, [_a], void 0, function* ({ inputData, mastra }) {
        if (!mastra) {
            throw new Error('Mastra is not initialized');
        }
        const { vacationDescription } = inputData;
        const result = yield mastra.getAgent('summaryTravelAgent').generate([
            {
                role: 'user',
                content: vacationDescription,
            },
        ]);
        console.log(result.text);
        return { suggestions: JSON.parse(result.text), vacationDescription };
    }),
});
const humanInputStep = (0, vNext_1.createStep)({
    id: 'human-input',
    inputSchema: zod_1.z.object({
        suggestions: zod_1.z.array(zod_1.z.string()),
        vacationDescription: zod_1.z.string(),
    }),
    outputSchema: zod_1.z.object({
        selection: zod_1.z.string().describe('The selection of the user'),
        vacationDescription: zod_1.z.string(),
    }),
    resumeSchema: zod_1.z.object({
        selection: zod_1.z.string().describe('The selection of the user'),
    }),
    suspendSchema: zod_1.z.object({
        suggestions: zod_1.z.array(zod_1.z.string()),
    }),
    execute: (_a) => __awaiter(void 0, [_a], void 0, function* ({ inputData, resumeData, suspend, getInitData }) {
        if (!(resumeData === null || resumeData === void 0 ? void 0 : resumeData.selection)) {
            yield suspend({ suggestions: inputData === null || inputData === void 0 ? void 0 : inputData.suggestions });
            return {
                selection: '',
                vacationDescription: inputData === null || inputData === void 0 ? void 0 : inputData.vacationDescription,
            };
        }
        return {
            selection: resumeData === null || resumeData === void 0 ? void 0 : resumeData.selection,
            vacationDescription: inputData === null || inputData === void 0 ? void 0 : inputData.vacationDescription,
        };
    }),
});
exports.humanInputStep = humanInputStep;
const travelPlannerStep = (0, vNext_1.createStep)({
    id: 'travel-planner',
    inputSchema: zod_1.z.object({
        selection: zod_1.z.string().describe('The selection of the user'),
        vacationDescription: zod_1.z.string(),
    }),
    outputSchema: zod_1.z.object({
        travelPlan: zod_1.z.string(),
    }),
    execute: (_a) => __awaiter(void 0, [_a], void 0, function* ({ inputData, mastra }) {
        const travelAgent = mastra === null || mastra === void 0 ? void 0 : mastra.getAgent('travelAgent');
        if (!travelAgent) {
            throw new Error('Travel agent is not initialized');
        }
        const { selection, vacationDescription } = inputData;
        const result = yield travelAgent.generate([
            { role: 'assistant', content: vacationDescription },
            { role: 'user', content: selection || '' },
        ]);
        console.log(result.text);
        return { travelPlan: result.text };
    }),
});
const travelAgentWorkflow = (0, vNext_1.createWorkflow)({
    id: 'travel-agent-workflow',
    inputSchema: zod_1.z.object({
        vacationDescription: zod_1.z.string().describe('The description of the vacation'),
    }),
    outputSchema: zod_1.z.object({
        travelPlan: zod_1.z.string(),
    }),
})
    .then(generateSuggestionsStep)
    .then(humanInputStep)
    .then(travelPlannerStep);
exports.travelAgentWorkflow = travelAgentWorkflow;
travelAgentWorkflow.commit();
