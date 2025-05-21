"use strict";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.docGeneratorAgent = void 0;
const agent_1 = require("@mastra/core/agent");
const openai_1 = require("@ai-sdk/openai");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const openai = (0, openai_1.createOpenAI)({
  apiKey: process.env.OPENAI_API_KEY,
});
const docGeneratorAgent = new agent_1.Agent({
  name: "doc_generator_agent",
  instructions: `You are a technical documentation expert. You will analyze the provided code files and generate a comprehensive documentation summary.
            For each file:
            1. Identify the main purpose and functionality
            2. Document key components, classes, functions, and interfaces
            3. Note important dependencies and relationships between components
            4. Highlight any notable patterns or architectural decisions
            5. Include relevant code examples where helpful

            Format the documentation in a clear, organized manner using markdown with:
            - File overviews
            - Component breakdowns  
            - Code examples
            - Cross-references between related components

            Focus on making the documentation clear and useful for developers who need to understand and work with this codebase.`,
  model: openai("gpt-4o"),
});
exports.docGeneratorAgent = docGeneratorAgent;
