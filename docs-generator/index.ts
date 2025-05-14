import { createWorkflow, createStep } from "@mastra/core/workflows/vNext";
import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import simpleGit from "simple-git";
import fs from "fs";
import path from "path";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import dotenv from "dotenv";
import { promptUserForFolders } from "./utils";


dotenv.config();

const ghRepoUrl = "https://github.com/manthanguptaa/CricLang";

if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
}

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

const docGeneratorAgent = new Agent({
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
  model: google("gemini-1.5-flash"),
});

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
  outputSchema: z.array(z.string()), // <-- FIXED: flat array of file paths
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

const generateReadmeStep = createStep({
  id: "generate_readme",
  description: "Generate the README.md file",
  inputSchema: z.object({
    path: z.string(),
    documentation: z.string(),
  }),
  outputSchema: z.string(),
  execute: async ({
    inputData,
    mastra,
    getStepResult,
    getInitData,
    runtimeContext,
  }) => {
    const readme = await docGeneratorAgent.generate(
      `Generate a README.md file for the following documentation: ${inputData.documentation}`,
    );

    return readme.text.toString();
  },
});

const collateDocumentationStep = createStep({
    id: "collate_documentation",
    inputSchema: z.array(z.string()),
    outputSchema: z.string(),
    execute: async ({inputData}) => {
        const readme = await docGeneratorAgent.generate(
            `Generate a README.md file for the following documentation: ${inputData.map((doc) => doc).join("\n")}`,
          );

        return readme.text.toString();
    }
})

const generateDocsWorkflow = createWorkflow({
  id: "generate-docs",
  inputSchema: z.string(),
  outputSchema: z.string(),
  steps: [scrapeCodeStep, generateDocForFileStep, generateReadmeStep],
})
  .then(scrapeCodeStep)
  .then(generateDocForFileStep)
  .then(generateReadmeStep)
  .commit();

const myWorkflow = createWorkflow({
  id: "docs-generator",
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
  steps: [cloneRepositoryStep, selectFolderStep, generateDocsWorkflow],
})
  .then(cloneRepositoryStep)
  .then(selectFolderStep)
  .foreach(generateDocsWorkflow)
  .then(collateDocumentationStep)
  .commit();

const mastra = new Mastra({
  agents: {
    docGeneratorAgent,
  },
  vnext_workflows: {
    myWorkflow,
    generateDocsWorkflow,
  },
});


async function runWorkflow() {
  const run = mastra.vnext_getWorkflow("myWorkflow").createRun();
  const res = await run.start({ inputData: { repoUrl: ghRepoUrl } });
  const { status, steps } = res;

  if (status === "suspended") {
    // Get the suspended step data
    const suspendedStep = steps["select_folder"];
    let folderList: string[] = [];

    if (
      suspendedStep.status === "suspended" &&
      "folders" in suspendedStep.payload
    ) {
      folderList = suspendedStep.payload.folders as string[];
    } else if (suspendedStep.status === "success" && suspendedStep.output) {
      folderList = suspendedStep.output;
    }

    if (!folderList.length) {
      console.log("No folders available for selection.");
      return;
    }

    const folders = await promptUserForFolders(folderList);

    const resumedResult = await run.resume({
      resumeData: { selection: folders },
      step: selectFolderStep,
    });

    // Print resumed result
    if (resumedResult.status === "success") {
      console.log(resumedResult.result);
    } else {
      console.log(resumedResult);
    }
    return;
  }

  // Not suspended: print result and return
  if (res.status === "success") {
    console.log(res.result ?? res);
  } else {
    console.log(res);
  }
}

runWorkflow();
