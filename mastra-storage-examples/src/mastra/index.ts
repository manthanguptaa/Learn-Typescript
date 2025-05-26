import { Mastra } from '@mastra/core/mastra'
import { createLogger } from '@mastra/core/logger'
import { activityPlanningWorkflow } from './workflows'
import { planningAgent } from './agents'
import { D1Store } from "@mastra/cloudflare-d1";
import { LibSQLStore } from '@mastra/libsql';


// Initialize Mastra with the activity planning workflow
// This enables the workflow to be executed and access the planning agent
export const mastra = new Mastra({
  workflows: {
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
  })
  // storage: new D1Store({
  //   accountId: "26b8b77a72d3c605241640cc370488a3",
  //   databaseId: "db983cb5-9055-424f-a40a-57c42c91654e",
  //   apiToken: "oz76EJVRlilFl7HZRnRSvRvSWpeuRocJvOc2Bi_C",
  // }),
})

// Function to query workflow runs
async function getWorkflowHistory() {
    const storage = mastra.getStorage();
    if (!storage) {
      throw new Error('Storage not initialized');
    }
  
    // Get recent workflow runs
    const recentRuns = await storage.getWorkflowRuns({
      fromDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      limit: 10,
      offset: 0
    });
  
    console.dir(recentRuns, { depth: null });
  
    // Get specific workflow run
    if (recentRuns.runs.length > 0) {
      const specificRun = await storage.getWorkflowRunById({
        runId: recentRuns.runs[0].runId,
      });
      console.dir(specificRun, { depth: null });
    }
}

async function main() {
    const workflow = mastra.getWorkflow('activityPlanningWorkflow')
    const run = workflow.createRun()
    
    // Start the workflow with a city
    // This will fetch weather and plan activities based on conditions
    const result = await run.start({ inputData: { city: 'New York' } })
    console.dir(result, { depth: null })

    // Get workflow history
    await getWorkflowHistory();
}

main()