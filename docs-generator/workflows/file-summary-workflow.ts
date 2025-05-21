import { createWorkflow, createStep } from "@mastra/core/workflows/vNext";
import { z } from "zod";
import fs from "fs";
import { docGeneratorAgent } from "../agents/docs-generator-agent";

const scrapeCodeStep = createStep({
  id: "scrape_code",
  description: "Scrape the code from a single file",
  inputSchema: z.string(),
  outputSchema: z.object({
    path: z.string(),
    content: z.string(),
  }),
  execute: async ({ inputData }) => {
    const filePath = inputData;
    const content = fs.readFileSync(filePath, "utf-8");
    return {
      path: filePath,
      content,
    };
  },
});

const generateDocForFileStep = createStep({
  id: "generateDocForFile",
  inputSchema: z.object({
    path: z.string(),
    content: z.string(),
  }),
  outputSchema: z.object({
    path: z.string(),
    documentation: z.string(),
  }),
  execute: async ({ inputData }) => {
    const docs = await docGeneratorAgent.generate(
      `Generate documentation for the following code: ${inputData.content}`,
    );
    return {
      path: inputData.path,
      documentation: docs.text.toString(),
    };
  },
});

const generateSummaryWorkflow = createWorkflow({
  id: "generate-summary",
  inputSchema: z.string(),
  outputSchema: z.object({
    path: z.string(),
    documentation: z.string(),
  }),
  steps: [scrapeCodeStep, generateDocForFileStep],
})
  .then(scrapeCodeStep)
  .then(generateDocForFileStep)
  .commit();

export { generateSummaryWorkflow };
