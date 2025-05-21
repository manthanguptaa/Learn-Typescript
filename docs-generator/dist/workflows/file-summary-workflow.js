"use strict";
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDocsWorkflow = void 0;
const vNext_1 = require("@mastra/core/workflows/vNext");
const zod_1 = require("zod");
const fs_1 = __importDefault(require("fs"));
const docs_generator_agent_1 = require("../agents/docs-generator-agent");
const scrapeCodeStep = (0, vNext_1.createStep)({
  id: "scrape_code",
  description: "Scrape the code from a single file",
  inputSchema: zod_1.z.string(),
  outputSchema: zod_1.z.object({
    path: zod_1.z.string(),
    content: zod_1.z.string(),
  }),
  execute: (_a) =>
    __awaiter(void 0, [_a], void 0, function* ({ inputData }) {
      const filePath = inputData;
      const content = fs_1.default.readFileSync(filePath, "utf-8");
      return {
        path: filePath,
        content,
      };
    }),
});
const generateDocForFileStep = (0, vNext_1.createStep)({
  id: "generateDocForFile",
  inputSchema: zod_1.z.object({
    path: zod_1.z.string(),
    content: zod_1.z.string(),
  }),
  outputSchema: zod_1.z.object({
    path: zod_1.z.string(),
    documentation: zod_1.z.string(),
  }),
  execute: (_a) =>
    __awaiter(void 0, [_a], void 0, function* ({ inputData }) {
      const docs = yield docs_generator_agent_1.docGeneratorAgent.generate(
        `Generate documentation for the following code: ${inputData.content}`,
      );
      return {
        path: inputData.path,
        documentation: docs.text.toString(),
      };
    }),
});
const generateDocsWorkflow = (0, vNext_1.createWorkflow)({
  id: "generate-docs",
  inputSchema: zod_1.z.string(),
  outputSchema: zod_1.z.object({
    path: zod_1.z.string(),
    documentation: zod_1.z.string(),
  }),
  steps: [scrapeCodeStep, generateDocForFileStep],
})
  .then(scrapeCodeStep)
  .then(generateDocForFileStep)
  .commit();
exports.generateDocsWorkflow = generateDocsWorkflow;
