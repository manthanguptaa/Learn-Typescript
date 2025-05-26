var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { Mastra } from '@mastra/core/mastra';
import { createLogger } from '@mastra/core/logger';
import { activityPlanningWorkflow } from './workflows';
import { planningAgent } from './agents';
import { LibSQLStore } from "@mastra/libsql";
// Initialize Mastra with the activity planning workflow
// This enables the workflow to be executed and access the planning agent
const mastra = new Mastra({
    vnext_workflows: {
        activityPlanningWorkflow,
    },
    agents: {
        planningAgent,
    },
    logger: createLogger({
        name: "Mastra",
        level: "info",
    }),
    storage: new LibSQLStore({
        url: "file:./mastra.db",
    }),
});
// Function to query workflow runs
function getWorkflowHistory() {
    return __awaiter(this, void 0, void 0, function* () {
        const storage = mastra.getStorage();
        if (!storage) {
            throw new Error('Storage not initialized');
        }
        // Get recent workflow runs
        const recentRuns = yield storage.getWorkflowRuns({
            workflowName: 'user-processor',
            fromDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
            limit: 10,
            offset: 0
        });
        console.log('Recent workflow runs:', recentRuns);
        // Get specific workflow run
        if (recentRuns.runs.length > 0) {
            const specificRun = yield storage.getWorkflowRunById({
                runId: recentRuns.runs[0].runId,
                workflowName: 'user-processor'
            });
            console.log('Specific workflow run:', specificRun);
        }
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const workflow = mastra.vnext_getWorkflow('activityPlanningWorkflow');
        const run = workflow.createRun();
        // Start the workflow with a city
        // This will fetch weather and plan activities based on conditions
        const result = yield run.start({ inputData: { city: 'New York' } });
        console.dir(result, { depth: null });
    });
}
main();
