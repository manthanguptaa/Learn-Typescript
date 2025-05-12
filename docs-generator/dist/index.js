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
const zod_1 = require("zod");
const simple_git_1 = __importDefault(require("simple-git"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const google_1 = require("@ai-sdk/google");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const gh_repo_url = "https://github.com/manthanguptaa/CricLang";
const google = (0, google_1.createGoogleGenerativeAI)({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});
const doc_generator_agent = new core_1.Agent({
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
const clone_repository_step = (0, vNext_1.createStep)({
    id: "clone_repository",
    description: "Clone the repository from the given URL",
    inputSchema: zod_1.z.object({
        repo_url: zod_1.z.string(),
    }),
    outputSchema: zod_1.z.object({
        success: zod_1.z.boolean(),
        message: zod_1.z.string(),
        data: zod_1.z.object({
            repo_url: zod_1.z.string(),
        }),
    }),
    execute: (_a) => __awaiter(void 0, [_a], void 0, function* ({ inputData, mastra, getStepResult, getInitData, runtimeContext, }) {
        const git = (0, simple_git_1.default)();
        if (fs_1.default.existsSync('./temp')) {
            return {
                success: true,
                message: "Repository already exists",
                data: {
                    repo_url: inputData.repo_url,
                },
            };
        }
        try {
            yield git.clone(inputData.repo_url, "./temp");
            return {
                success: true,
                message: "Repository cloned successfully",
                data: {
                    repo_url: inputData.repo_url,
                },
            };
        }
        catch (error) {
            throw new Error(`Failed to clone repository: ${error}`);
        }
    }),
});
const select_folder_step = (0, vNext_1.createStep)({
    id: "select_folder",
    description: "Select the folder to generate the docs",
    inputSchema: zod_1.z.object({
        success: zod_1.z.boolean(),
        message: zod_1.z.string(),
        data: zod_1.z.object({
            repo_url: zod_1.z.string(),
        }),
    }),
    outputSchema: zod_1.z.object({
        selected_folders: zod_1.z.array(zod_1.z.string()),
    }),
    suspendSchema: zod_1.z.object({
        folders: zod_1.z.array(zod_1.z.string()),
        message: zod_1.z.string(),
    }),
    resumeSchema: zod_1.z.object({
        selection: zod_1.z.array(zod_1.z.string()),
    }),
    execute: (_a) => __awaiter(void 0, [_a], void 0, function* ({ inputData, resumeData, suspend }) {
        const tempPath = './temp';
        const folders = fs_1.default.readdirSync(tempPath)
            .filter(item => fs_1.default.statSync(path_1.default.join(tempPath, item)).isDirectory());
        if (!(resumeData === null || resumeData === void 0 ? void 0 : resumeData.selection)) {
            yield suspend({
                folders: folders,
                message: "Please select folders to generate documentation for:"
            });
            return {
                selected_folders: []
            };
        }
        const selectedFolders = resumeData.selection.includes("*") ? folders : resumeData.selection;
        return {
            selected_folders: selectedFolders
        };
    }),
});
const scrape_code_step = (0, vNext_1.createStep)({
    id: "scrape_code",
    description: "Scrape the code from the selected folders",
    inputSchema: zod_1.z.object({
        selected_folders: zod_1.z.array(zod_1.z.string()),
    }),
    outputSchema: zod_1.z.object({
        files: zod_1.z.array(zod_1.z.object({
            path: zod_1.z.string(),
            content: zod_1.z.string()
        }))
    }),
    execute: (_a) => __awaiter(void 0, [_a], void 0, function* ({ inputData, mastra, getStepResult, getInitData, runtimeContext, }) {
        const files = [];
        const tempPath = './temp';
        for (const folder of inputData.selected_folders) {
            const folderPath = path_1.default.join(tempPath, folder);
            const readFilesRecursively = (dir) => {
                const items = fs_1.default.readdirSync(dir);
                for (const item of items) {
                    const fullPath = path_1.default.join(dir, item);
                    const stat = fs_1.default.statSync(fullPath);
                    if (stat.isDirectory()) {
                        readFilesRecursively(fullPath);
                    }
                    else if (stat.isFile()) {
                        const content = fs_1.default.readFileSync(fullPath, 'utf-8');
                        files.push({
                            path: fullPath.replace(tempPath + '/', ''),
                            content: content
                        });
                    }
                }
            };
            readFilesRecursively(folderPath);
        }
        return {
            files
        };
    })
});
const generate_docs_step = (0, vNext_1.createStep)({
    id: "generate_docs",
    description: "Generate the docs from the scraped code",
    inputSchema: zod_1.z.object({
        files: zod_1.z.array(zod_1.z.object({
            path: zod_1.z.string(),
            content: zod_1.z.string()
        }))
    }),
    outputSchema: zod_1.z.object({
        docs: zod_1.z.array(zod_1.z.object({
            path: zod_1.z.string(),
            documentation: zod_1.z.string()
        }))
    }),
    execute: (_a) => __awaiter(void 0, [_a], void 0, function* ({ inputData, mastra, getStepResult, getInitData, runtimeContext, }) {
        let result = [];
        for (const file of inputData.files) {
            const docs = yield doc_generator_agent.generate(`Generate documentation for the following code: ${file.content}`);
            result.push({ path: file.path, documentation: docs.toString() });
        }
        return {
            docs: result
        };
    })
});
const generate_readme_step = (0, vNext_1.createStep)({
    id: "generate_readme",
    description: "Generate the README.md file",
    inputSchema: zod_1.z.object({
        docs: zod_1.z.array(zod_1.z.object({
            path: zod_1.z.string(),
            documentation: zod_1.z.string()
        }))
    }),
    outputSchema: zod_1.z.object({
        readme: zod_1.z.string()
    }),
    execute: (_a) => __awaiter(void 0, [_a], void 0, function* ({ inputData, mastra, getStepResult, getInitData, runtimeContext, }) {
        const readme = yield doc_generator_agent.generate(`Generate a README.md file for the following documentation: ${inputData.docs.map(doc => doc.documentation).join("\n")}`);
        return {
            readme: readme.toString()
        };
    })
});
const myWorkflow = (0, vNext_1.createWorkflow)({
    id: "docs-generator",
    inputSchema: zod_1.z.object({
        repo_url: zod_1.z.string(),
    }),
    outputSchema: zod_1.z.object({
        success: zod_1.z.boolean(),
        message: zod_1.z.string(),
        data: zod_1.z.object({
            repo_url: zod_1.z.string(),
        }),
    }),
    steps: [clone_repository_step, select_folder_step, scrape_code_step, generate_docs_step, generate_readme_step],
}).then(clone_repository_step)
    .then(select_folder_step)
    .then(scrape_code_step)
    .then(generate_docs_step)
    .then(generate_readme_step).commit();
const mastra = new core_1.Mastra({
    agents: {
        doc_generator_agent
    },
    vnext_workflows: {
        myWorkflow
    }
});
function runWorkflow() {
    return __awaiter(this, void 0, void 0, function* () {
        const run = mastra.vnext_getWorkflow("myWorkflow").createRun();
        const res = yield run.start({ inputData: { repo_url: gh_repo_url } });
        if (res.status === 'suspended') {
            // Get the suspended step data
            const suspendedStep = res.steps['select_folder'];
            console.log("Available folders:");
            if (suspendedStep.status === 'success') {
                console.log(suspendedStep.output);
            }
            else if (suspendedStep.status === 'suspended') {
                if ("folders" in suspendedStep.payload) {
                    const folder_list = suspendedStep.payload.folders;
                    folder_list.forEach((folder) => {
                        console.log(`- ${folder}`);
                    });
                }
                else {
                    console.log("No payload available");
                }
            }
            else {
                const payload = null;
            }
            console.log("- * (All folders)");
            // Allow user input through readline
            const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout
            });
            const folders = yield new Promise((resolve) => {
                readline.question('Enter folder names separated by comma (or * for all): ', (answer) => {
                    readline.close();
                    const selection = answer.split(',').map(f => f.trim());
                    resolve(selection);
                });
            });
            const resumedResult = yield run.resume({
                resumeData: {
                    selection: folders
                },
                step: select_folder_step
            });
            console.log('Resumed result:', resumedResult);
        }
        else {
            console.log('Workflow result:', res);
        }
        console.log("Result: ");
        console.log(res);
    });
}
runWorkflow();
