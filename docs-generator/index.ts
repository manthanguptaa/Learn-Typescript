import { createWorkflow, createStep } from "@mastra/core/workflows/vNext";
import { Agent, Mastra } from "@mastra/core";
import { z } from "zod";
import simpleGit from 'simple-git';
import fs from 'fs';
import path from 'path';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import dotenv from 'dotenv';

dotenv.config();


const gh_repo_url = "https://github.com/manthanguptaa/CricLang"

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });

const doc_generator_agent = new Agent({
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

const clone_repository_step = createStep({
    id: "clone_repository",
    description: "Clone the repository from the given URL",
    inputSchema: z.object({
        repo_url: z.string(),
    }),
    outputSchema: z.object({
        success: z.boolean(),
        message: z.string(),
        data: z.object({
            repo_url: z.string(),
        }),
    }),
    execute: async ({
        inputData,
        mastra,
        getStepResult,
        getInitData,
        runtimeContext,
    })=>{
        const git = simpleGit();
        if (fs.existsSync('./temp')) {
            return {
                success: true,
                message: "Repository already exists",
                data: {
                    repo_url: inputData.repo_url,
                },
            };
        }
        try {
            await git.clone(inputData.repo_url, "./temp");
            return {
                success: true,
                message: "Repository cloned successfully", 
                data: {
                    repo_url: inputData.repo_url,
                },
            };
        } catch (error) {
            throw new Error(`Failed to clone repository: ${error}`);
        }
    },
});

const select_folder_step = createStep({
    id: "select_folder",
    description: "Select the folder to generate the docs",
    inputSchema: z.object({
        success: z.boolean(),
        message: z.string(),
        data: z.object({
            repo_url: z.string(),
        }),
    }),
    outputSchema: z.object({
        selected_folders: z.array(z.string()),
    }),
    suspendSchema: z.object({
        folders: z.array(z.string()),
        message: z.string(),
    }),
    resumeSchema: z.object({
        selection: z.array(z.string()),
    }),
    execute: async ({
        inputData,
        resumeData,
        suspend
    })=>{
        const tempPath = './temp';
        const folders = fs.readdirSync(tempPath)
            .filter(item => fs.statSync(path.join(tempPath, item)).isDirectory());

        if (!resumeData?.selection) {
            await suspend({
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
    },   
})

const scrape_code_step = createStep({
    id: "scrape_code", 
    description: "Scrape the code from the selected folders",
    inputSchema: z.object({
        selected_folders: z.array(z.string()),
    }),
    outputSchema: z.object({
        files: z.array(z.object({
            path: z.string(),
            content: z.string()
        }))
    }),
    execute: async({
        inputData,
        mastra,
        getStepResult,
        getInitData,
        runtimeContext,
    })=>{
        const files: {path: string, content: string}[] = [];
        const tempPath = './temp';

        for (const folder of inputData.selected_folders) {
            const folderPath = path.join(tempPath, folder);
            
            const readFilesRecursively = (dir: string) => {
                const items = fs.readdirSync(dir);
                
                for (const item of items) {
                    const fullPath = path.join(dir, item);
                    const stat = fs.statSync(fullPath);
                    
                    if (stat.isDirectory()) {
                        readFilesRecursively(fullPath);
                    } else if (stat.isFile()) {
                        const content = fs.readFileSync(fullPath, 'utf-8');
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
    }
})

const generate_docs_step = createStep({
    id: "generate_docs",
    description: "Generate the docs from the scraped code",
    inputSchema: z.object({
        files: z.array(z.object({
            path: z.string(),
            content: z.string()
        }))
    }),
    outputSchema: z.object({
        docs: z.array(z.object({
            path: z.string(),
            documentation: z.string()
        }))
    }),
    execute: async({
        inputData,
        mastra,
        getStepResult,
        getInitData,
        runtimeContext,
    })=>{
        let result: {path: string, documentation: string}[] = [];
        for (const file of inputData.files) {
            const docs = await doc_generator_agent.generate(`Generate documentation for the following code: ${file.content}`);
            result.push({path: file.path, documentation: docs.toString()});
        }

        return {
            docs: result
        };
    }
})

const generate_readme_step = createStep({
    id: "generate_readme",
    description: "Generate the README.md file",
    inputSchema: z.object({
        docs: z.array(z.object({
            path: z.string(),
            documentation: z.string()
        }))
    }),
    outputSchema: z.object({
        readme: z.string()
    }),
    execute: async({
        inputData,
        mastra,
        getStepResult,
        getInitData,
        runtimeContext,
    })=>{
        const readme = await doc_generator_agent.generate(`Generate a README.md file for the following documentation: ${inputData.docs.map(doc => doc.documentation).join("\n")}`);
        return {
            readme: readme.toString()
        };
    }
})


const myWorkflow = createWorkflow({
    id: "docs-generator",
    inputSchema: z.object({
        repo_url: z.string(),
    }),
    outputSchema: z.object({
        success: z.boolean(),
        message: z.string(),
        data: z.object({
            repo_url: z.string(),
        }),
    }),
    steps: [clone_repository_step, select_folder_step, scrape_code_step, generate_docs_step, generate_readme_step],
}).then(clone_repository_step)
.then(select_folder_step)
.then(scrape_code_step)
.then(generate_docs_step)
.then(generate_readme_step).commit()

const mastra = new Mastra({
    agents: {
        doc_generator_agent
    },
    vnext_workflows: {
        myWorkflow
    }
});

async function runWorkflow() {
    const run = mastra.vnext_getWorkflow("myWorkflow").createRun();
    const res = await run.start({inputData: {repo_url: gh_repo_url}});

    if (res.status === 'suspended') {
        // Get the suspended step data
        const suspendedStep = res.steps['select_folder'];
        console.log("Available folders:");
        if (suspendedStep.status === 'success') {
            console.log(suspendedStep.output);
        } else if (suspendedStep.status === 'suspended') {
            if ("folders" in suspendedStep.payload) {
                const folder_list: string[] = suspendedStep.payload.folders as string[];
                folder_list.forEach((folder: string) => {
                    console.log(`- ${folder}`);
                });
            } else {
                console.log("No payload available");
            }
        } else {
            const payload = null;
        }
        console.log("- * (All folders)");

        // Allow user input through readline
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const folders: string[] = await new Promise((resolve) => {
            readline.question('Enter folder names separated by comma (or * for all): ', (answer: string) => {
                readline.close();
                const selection = answer.split(',').map(f => f.trim());
                resolve(selection);
            });
        });

        const resumedResult = await run.resume({
            resumeData: {
                selection: folders
            },
            step: select_folder_step
        });
        console.log('Resumed result:', resumedResult);

    } else {
        console.log('Workflow result:', res);
    }
}

runWorkflow();