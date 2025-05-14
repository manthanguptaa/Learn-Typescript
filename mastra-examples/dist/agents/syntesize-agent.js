"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.synthesizeAgent = void 0;
const agent_1 = require("@mastra/core/agent");
const openai_1 = require("@ai-sdk/openai");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const openai = (0, openai_1.createOpenAI)({
    apiKey: process.env.OPENAI_API_KEY,
});
const synthesizeAgent = new agent_1.Agent({
    name: 'synthesizeAgent',
    model: openai('gpt-4o'),
    instructions: `
  You are given two different blocks of text, one about indoor activities and one about outdoor activities.
  Make this into a full report about the day and the possibilities depending on whether it rains or not.
  `,
});
exports.synthesizeAgent = synthesizeAgent;
