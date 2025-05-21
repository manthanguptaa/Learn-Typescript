import { createWorkflow, createStep } from "@mastra/core/workflows/vNext";
import { z } from "zod";
import simpleGit from "simple-git";
import fs from "fs";
import path from "path";
import { docGeneratorAgent } from "../agents/docs-generator-agent";
import { generateSummaryWorkflow } from "./file-summary-workflow";

const cloneRepositoryStep = createStep({
  id: "clone_repository",
  description: "Clone the repository from the given URL",
  inputSchema: z.object({
    repoUrl: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    data: z.object({
      repoUrl: z.string(),
    }),
  }),
  execute: async ({
    inputData,
    mastra,
    getStepResult,
    getInitData,
    runtimeContext,
  }) => {
    const git = simpleGit();
    if (fs.existsSync("./temp")) {
      return {
        success: true,
        message: "Repository already exists",
        data: {
          repoUrl: inputData.repoUrl,
        },
      };
    }
    try {
      await git.clone(inputData.repoUrl, "./temp");
      return {
        success: true,
        message: "Repository cloned successfully",
        data: {
          repoUrl: inputData.repoUrl,
        },
      };
    } catch (error) {
      throw new Error(`Failed to clone repository: ${error}`);
    }
  },
});

const selectFolderStep = createStep({
  id: "select_folder",
  description: "Select the folder(s) to generate the docs",
  inputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    data: z.object({
      repoUrl: z.string(),
    }),
  }),
  outputSchema: z.array(z.string()),
  suspendSchema: z.object({
    folders: z.array(z.string()),
    message: z.string(),
  }),
  resumeSchema: z.object({
    selection: z.array(z.string()),
  }),
  execute: async ({ resumeData, suspend }) => {
    const tempPath = "./temp";
    const folders = fs
      .readdirSync(tempPath)
      .filter((item) => fs.statSync(path.join(tempPath, item)).isDirectory());

    if (!resumeData?.selection) {
      await suspend({
        folders,
        message: "Please select folders to generate documentation for:",
      });
      return [];
    }

    // Gather all file paths from selected folders
    const filePaths: string[] = [];
    const readFilesRecursively = (dir: string) => {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          readFilesRecursively(fullPath);
        } else if (stat.isFile()) {
          filePaths.push(fullPath.replace(tempPath + "/", ""));
        }
      }
    };

    for (const folder of resumeData.selection) {
      readFilesRecursively(path.join(tempPath, folder));
    }

    return filePaths;
  },
});

const collateDocumentationStep = createStep({
  id: "collate_documentation",
  inputSchema: z.array(
    z.object({
      path: z.string(),
      documentation: z.string(),
    }),
  ),
  outputSchema: z.string(),
  execute: async ({ inputData }) => {
    const readme = await docGeneratorAgent.generate(
      `Generate a README.md file for the following documentation: ${inputData.map((doc) => doc.documentation).join("\n")}`,
    );

    return readme.text.toString();
  },
});

const readmeGeneratorWorkflow = createWorkflow({
  id: "readme-generator",
  inputSchema: z.object({
    repoUrl: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    data: z.object({
      repoUrl: z.string(),
    }),
  }),
  steps: [cloneRepositoryStep, selectFolderStep, generateSummaryWorkflow],
})
  .then(cloneRepositoryStep)
  .then(selectFolderStep)
  .foreach(generateSummaryWorkflow)
  .then(collateDocumentationStep)
  .commit();

export { readmeGeneratorWorkflow };
