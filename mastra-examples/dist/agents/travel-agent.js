"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.travelAgent = exports.summaryTravelAgent = void 0;
const agent_1 = require("@mastra/core/agent");
const openai_1 = require("@ai-sdk/openai");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const openai = (0, openai_1.createOpenAI)({
    apiKey: process.env.OPENAI_API_KEY,
});
exports.summaryTravelAgent = new agent_1.Agent({
    name: 'summaryTravelAgent',
    model: openai('gpt-4o'),
    instructions: `
  You are a travel agent who is given a user prompt about what kind of holiday they want to go on.
  You then generate 3 different options for the holiday. Return the suggestions as a JSON array {"location": "string", "description": "string"}[]. Don't format as markdown.
 
  Make the options as different as possible from each other.
  Also make the plan very short and summarized.
  `,
});
exports.travelAgent = new agent_1.Agent({
    name: 'travelAgent',
    model: openai('gpt-4o'),
    instructions: `
  You are a travel agent who is given a user prompt about what kind of holiday they want to go on. A summary of the plan is provided as well as the location.
  You then generate a detailed travel plan for the holiday.
  `,
});
