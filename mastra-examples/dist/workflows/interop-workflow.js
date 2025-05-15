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
exports.weatherWorkflow = void 0;
const vNext_1 = require("@mastra/core/workflows/vNext");
const weather_tool_1 = require("../tools/weather-tool");
const weather_reporter_agent_1 = require("../agents/weather-reporter-agent");
const zod_1 = require("zod");
const fetchWeather = (0, vNext_1.createStep)(weather_tool_1.weatherTool);
const reportWeather = (0, vNext_1.createStep)(weather_reporter_agent_1.weatherReporterAgent);
const weatherWorkflow = (0, vNext_1.createWorkflow)({
    steps: [fetchWeather, reportWeather],
    id: 'weather-workflow-step1-single-day',
    inputSchema: zod_1.z.object({
        location: zod_1.z.string().describe('The city to get the weather for'),
    }),
    outputSchema: zod_1.z.object({
        text: zod_1.z.string(),
    }),
})
    .then(fetchWeather)
    .then((0, vNext_1.createStep)({
    id: 'report-weather',
    inputSchema: fetchWeather.outputSchema,
    outputSchema: zod_1.z.object({
        text: zod_1.z.string(),
    }),
    execute: (_a) => __awaiter(void 0, [_a], void 0, function* ({ inputData, mastra }) {
        const prompt = 'Forecast data: ' + JSON.stringify(inputData);
        const agent = mastra.getAgent('weatherReporterAgent');
        const result = yield agent.generate([
            {
                role: 'user',
                content: prompt,
            },
        ]);
        return { text: result.text };
    }),
}));
exports.weatherWorkflow = weatherWorkflow;
weatherWorkflow.commit();
