import { createWorkflow, createStep } from "@mastra/core/workflows/vNext";
import { Agent, Mastra } from "@mastra/core";
import { z } from "zod";
import simpleGit from "simple-git";
import fs from "fs";
import path from "path";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import dotenv from "dotenv";

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
  description: "Select the folder to generate the docs",
  inputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    data: z.object({
      repoUrl: z.string(),
    }),
  }),
  outputSchema: z.object({
    selectedFolders: z.array(z.string()),
  }),
  suspendSchema: z.object({
    folders: z.array(z.string()),
    message: z.string(),
  }),
  resumeSchema: z.object({
    selection: z.array(z.string()),
  }),
  execute: async ({ inputData, resumeData, suspend }) => {
    const tempPath = "./temp";
    const folders = fs
      .readdirSync(tempPath)
      .filter((item) => fs.statSync(path.join(tempPath, item)).isDirectory());

    if (!resumeData?.selection) {
      await suspend({
        folders: folders,
        message: "Please select folders to generate documentation for:",
      });
      return {
        selectedFolders: [],
      };
    }

    const selectedFolders = resumeData.selection.includes("*")
      ? folders
      : resumeData.selection;

    return {
      selectedFolders: selectedFolders,
    };
  },
});

const scrapeCodeStep = createStep({
  id: "scrape_code",
  description: "Scrape the code from the selected folders",
  inputSchema: z.object({
    selectedFolders: z.array(z.string()),
  }),
  outputSchema: z.array(
    z.object({
      path: z.string(),
      content: z.string(),
    }),
  ),
  execute: async ({
    inputData,
    mastra,
    getStepResult,
    getInitData,
    runtimeContext,
  }) => {
    const files: { path: string; content: string }[] = [];
    const tempPath = "./temp";

    for (const folder of inputData.selectedFolders) {
      const folderPath = path.join(tempPath, folder);

      const readFilesRecursively = (dir: string) => {
        const items = fs.readdirSync(dir);

        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            readFilesRecursively(fullPath);
          } else if (stat.isFile()) {
            const content = fs.readFileSync(fullPath, "utf-8");
            files.push({
              path: fullPath.replace(tempPath + "/", ""),
              content: content,
            });
          }
        }
      };

      readFilesRecursively(folderPath);
    }

    return files;
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
  inputSchema: z.array(
    z.object({
      path: z.string(),
      documentation: z.string(),
    }),
  ),
  outputSchema: z.string(),
  execute: async ({
    inputData,
    mastra,
    getStepResult,
    getInitData,
    runtimeContext,
  }) => {
    const readme = await docGeneratorAgent.generate(
      `Generate a README.md file for the following documentation: ${inputData.map((doc) => doc.documentation).join("\n")}`,
    );

    return readme.text.toString();
  },
});

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
  steps: [
    cloneRepositoryStep,
    selectFolderStep,
    scrapeCodeStep,
    generateDocForFileStep,
    generateReadmeStep,
  ],
})
  .then(cloneRepositoryStep)
  .then(selectFolderStep)
  .then(scrapeCodeStep)
  .foreach(generateDocForFileStep)
  .then(generateReadmeStep)
  .commit();

const mastra = new Mastra({
  agents: {
    docGeneratorAgent,
  },
  vnext_workflows: {
    myWorkflow,
  },
});

async function promptUserForFolders(folderList: string[]): Promise<string[]> {
  folderList.forEach((folder) => console.log(`- ${folder}`));
  console.log("- * (All folders)");

  const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    readline.question(
      "Enter folder names separated by comma (or * for all): ",
      (answer: string) => {
        readline.close();
        resolve(answer.split(",").map((f) => f.trim()));
      }
    );
  });
}

async function runWorkflow() {
  const run = mastra.vnext_getWorkflow("myWorkflow").createRun();
  const res = await run.start({ inputData: { repoUrl: ghRepoUrl } });
  const { status, steps } = res;

  if (status === "suspended") {
    // Get the suspended step data
    const suspendedStep = steps["select_folder"];
    let folderList: string[] = [];

    if (suspendedStep.status === "suspended" && "folders" in suspendedStep.payload) {
      folderList = suspendedStep.payload.folders as string[];
    } else if (suspendedStep.status === "success" && suspendedStep.output?.selectedFolders) {
      folderList = suspendedStep.output.selectedFolders;
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
      console.log(resumedResult.result ?? resumedResult);
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
