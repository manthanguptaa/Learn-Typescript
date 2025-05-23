"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vNext_1 = require("@mastra/core/workflows/vNext");
const core_1 = require("@mastra/core");
const agent_1 = require("@mastra/core/agent");
const zod_1 = require("zod");
const simple_git_1 = __importDefault(require("simple-git"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const google_1 = require("@ai-sdk/google");
const dotenv_1 = __importDefault(require("dotenv"));
const utils_1 = require("./utils");
dotenv_1.default.config();
const ghRepoUrl = "https://github.com/manthanguptaa/CricLang";
if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
}
const google = (0, google_1.createGoogleGenerativeAI)({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
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
    model: google("gemini-1.5-flash"),
});
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
    execute: (_a) => __awaiter(void 0, [_a], void 0, function* ({ inputData, mastra, getStepResult, getInitData, runtimeContext, }) {
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
        }
        catch (error) {
            throw new Error(`Failed to clone repository: ${error}`);
        }
    }),
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
    outputSchema: zod_1.z.array(zod_1.z.string()), // <-- FIXED: flat array of file paths
    suspendSchema: zod_1.z.object({
        folders: zod_1.z.array(zod_1.z.string()),
        message: zod_1.z.string(),
    }),
    resumeSchema: zod_1.z.object({
        selection: zod_1.z.array(zod_1.z.string()),
    }),
    execute: (_a) => __awaiter(void 0, [_a], void 0, function* ({ resumeData, suspend }) {
        const tempPath = "./temp";
        const folders = fs_1.default
            .readdirSync(tempPath)
            .filter((item) => fs_1.default.statSync(path_1.default.join(tempPath, item)).isDirectory());
        if (!(resumeData === null || resumeData === void 0 ? void 0 : resumeData.selection)) {
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
                }
                else if (stat.isFile()) {
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
const scrapeCodeStep = (0, vNext_1.createStep)({
    id: "scrape_code",
    description: "Scrape the code from a single file",
    inputSchema: zod_1.z.string(),
    outputSchema: zod_1.z.object({
        path: zod_1.z.string(),
        content: zod_1.z.string(),
    }),
    execute: (_a) => __awaiter(void 0, [_a], void 0, function* ({ inputData }) {
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
    execute: (_a) => __awaiter(void 0, [_a], void 0, function* ({ inputData }) {
        const docs = yield docGeneratorAgent.generate(`Generate documentation for the following code: ${inputData.content}`);
        return {
            path: inputData.path,
            documentation: docs.text.toString(),
        };
    }),
});
const generateReadmeStep = (0, vNext_1.createStep)({
    id: "generate_readme",
    description: "Generate the README.md file",
    inputSchema: zod_1.z.object({
        path: zod_1.z.string(),
        documentation: zod_1.z.string(),
    }),
    outputSchema: zod_1.z.string(),
    execute: (_a) => __awaiter(void 0, [_a], void 0, function* ({ inputData, mastra, getStepResult, getInitData, runtimeContext, }) {
        const readme = yield docGeneratorAgent.generate(`Generate a README.md file for the following documentation: ${inputData.documentation}`);
        return readme.text.toString();
    }),
});
const collateDocumentationStep = (0, vNext_1.createStep)({
    id: "collate_documentation",
    inputSchema: zod_1.z.array(zod_1.z.string()),
    outputSchema: zod_1.z.string(),
    execute: (_a) => __awaiter(void 0, [_a], void 0, function* ({ inputData }) {
        const readme = yield docGeneratorAgent.generate(`Generate a README.md file for the following documentation: ${inputData.map((doc) => doc).join("\n")}`);
        return readme.text.toString();
    })
});
const generateDocsWorkflow = (0, vNext_1.createWorkflow)({
    id: "generate-docs",
    inputSchema: zod_1.z.string(),
    outputSchema: zod_1.z.string(),
    steps: [scrapeCodeStep, generateDocForFileStep, generateReadmeStep],
})
    .then(scrapeCodeStep)
    .then(generateDocForFileStep)
    .then(generateReadmeStep)
    .commit();
const myWorkflow = (0, vNext_1.createWorkflow)({
    id: "docs-generator",
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
    steps: [cloneRepositoryStep, selectFolderStep, generateDocsWorkflow],
})
    .then(cloneRepositoryStep)
    .then(selectFolderStep)
    .foreach(generateDocsWorkflow)
    .then(collateDocumentationStep)
    .commit();
const mastra = new core_1.Mastra({
    agents: {
        docGeneratorAgent,
    },
    vnext_workflows: {
        myWorkflow,
        generateDocsWorkflow,
    },
});
function runWorkflow() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const run = mastra.vnext_getWorkflow("myWorkflow").createRun();
        const res = yield run.start({ inputData: { repoUrl: ghRepoUrl } });
        const { status, steps } = res;
        if (status === "suspended") {
            // Get the suspended step data
            const suspendedStep = steps["select_folder"];
            let folderList = [];
            if (suspendedStep.status === "suspended" &&
                "folders" in suspendedStep.payload) {
                folderList = suspendedStep.payload.folders;
            }
            else if (suspendedStep.status === "success" && suspendedStep.output) {
                folderList = suspendedStep.output;
            }
            if (!folderList.length) {
                console.log("No folders available for selection.");
                return;
            }
            const folders = yield (0, utils_1.promptUserForFolders)(folderList);
            const resumedResult = yield run.resume({
                resumeData: { selection: folders },
                step: selectFolderStep,
            });
            // Print resumed result
            if (resumedResult.status === "success") {
                console.log(resumedResult.result);
            }
            else {
                console.log(resumedResult);
            }
            return;
        }
        // Not suspended: print result and return
        if (res.status === "success") {
            console.log((_a = res.result) !== null && _a !== void 0 ? _a : res);
        }
        else {
            console.log(res);
        }
    });
}
runWorkflow();
