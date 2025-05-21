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
exports.readmeGeneratorWorkflow = void 0;
const vNext_1 = require("@mastra/core/workflows/vNext");
const zod_1 = require("zod");
const simple_git_1 = __importDefault(require("simple-git"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const docs_generator_agent_1 = require("../agents/docs-generator-agent");
const file_summary_workflow_1 = require("./file-summary-workflow");
const cloneRepositoryStep = (0, vNext_1.createStep)({
  id: "clone_repository",
  description: "Clone the repository from the given URL",
  inputSchema: zod_1.z.object({
    repoUrl: zod_1.z.string(),
  }),
  outputSchema: zod_1.z.object({
    success: zod_1.z.boolean(),
    message: zod_1.z.string(),
    data: zod_1.z.object({
      repoUrl: zod_1.z.string(),
    }),
  }),
  execute: (_a) =>
    __awaiter(
      void 0,
      [_a],
      void 0,
      function* ({
        inputData,
        mastra,
        getStepResult,
        getInitData,
        runtimeContext,
      }) {
        const git = (0, simple_git_1.default)();
        if (fs_1.default.existsSync("./temp")) {
          return {
            success: true,
            message: "Repository already exists",
            data: {
              repoUrl: inputData.repoUrl,
            },
          };
        }
        try {
          yield git.clone(inputData.repoUrl, "./temp");
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
    ),
});
const selectFolderStep = (0, vNext_1.createStep)({
  id: "select_folder",
  description: "Select the folder(s) to generate the docs",
  inputSchema: zod_1.z.object({
    success: zod_1.z.boolean(),
    message: zod_1.z.string(),
    data: zod_1.z.object({
      repoUrl: zod_1.z.string(),
    }),
  }),
  outputSchema: zod_1.z.array(zod_1.z.string()),
  suspendSchema: zod_1.z.object({
    folders: zod_1.z.array(zod_1.z.string()),
    message: zod_1.z.string(),
  }),
  resumeSchema: zod_1.z.object({
    selection: zod_1.z.array(zod_1.z.string()),
  }),
  execute: (_a) =>
    __awaiter(void 0, [_a], void 0, function* ({ resumeData, suspend }) {
      const tempPath = "./temp";
      const folders = fs_1.default
        .readdirSync(tempPath)
        .filter((item) =>
          fs_1.default
            .statSync(path_1.default.join(tempPath, item))
            .isDirectory(),
        );
      if (
        !(resumeData === null || resumeData === void 0
          ? void 0
          : resumeData.selection)
      ) {
        yield suspend({
          folders,
          message: "Please select folders to generate documentation for:",
        });
        return [];
      }
      // Gather all file paths from selected folders
      const filePaths = [];
      const readFilesRecursively = (dir) => {
        const items = fs_1.default.readdirSync(dir);
        for (const item of items) {
          const fullPath = path_1.default.join(dir, item);
          const stat = fs_1.default.statSync(fullPath);
          if (stat.isDirectory()) {
            readFilesRecursively(fullPath);
          } else if (stat.isFile()) {
            filePaths.push(fullPath.replace(tempPath + "/", ""));
          }
        }
      };
      for (const folder of resumeData.selection) {
        readFilesRecursively(path_1.default.join(tempPath, folder));
      }
      return filePaths;
    }),
});
const collateDocumentationStep = (0, vNext_1.createStep)({
  id: "collate_documentation",
  inputSchema: zod_1.z.array(
    zod_1.z.object({
      path: zod_1.z.string(),
      documentation: zod_1.z.string(),
    }),
  ),
  outputSchema: zod_1.z.string(),
  execute: (_a) =>
    __awaiter(void 0, [_a], void 0, function* ({ inputData }) {
      const readme = yield docs_generator_agent_1.docGeneratorAgent.generate(
        `Generate a README.md file for the following documentation: ${inputData.map((doc) => doc.documentation).join("\n")}`,
      );
      return readme.text.toString();
    }),
});
const readmeGeneratorWorkflow = (0, vNext_1.createWorkflow)({
  id: "readme-generator",
  inputSchema: zod_1.z.object({
    repoUrl: zod_1.z.string(),
  }),
  outputSchema: zod_1.z.object({
    success: zod_1.z.boolean(),
    message: zod_1.z.string(),
    data: zod_1.z.object({
      repoUrl: zod_1.z.string(),
    }),
  }),
  steps: [
    cloneRepositoryStep,
    selectFolderStep,
    file_summary_workflow_1.generateDocsWorkflow,
  ],
})
  .then(cloneRepositoryStep)
  .then(selectFolderStep)
  .foreach(file_summary_workflow_1.generateDocsWorkflow)
  .then(collateDocumentationStep)
  .commit();
exports.readmeGeneratorWorkflow = readmeGeneratorWorkflow;
