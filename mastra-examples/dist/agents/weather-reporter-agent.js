"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.weatherReporterAgent = void 0;
const openai_1 = require("@ai-sdk/openai");
const dotenv_1 = __importDefault(require("dotenv"));
const agent_1 = require("@mastra/core/agent");
dotenv_1.default.config();
const openai = (0, openai_1.createOpenAI)({
    apiKey: process.env.OPENAI_API_KEY,
});
exports.weatherReporterAgent = new agent_1.Agent({
    name: 'weatherExplainerAgent',
    model: openai('gpt-4o'),
    instructions: `
  You are an weather explainer. 
  You have access to input that will help you get weather-specific activities for any city. 
  The tool uses agents to plan the activities, you just need to provide the city. 
  Explain the weather report like a weather reporter.
  `,
});
