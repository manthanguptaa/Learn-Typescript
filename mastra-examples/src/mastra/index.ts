import { Mastra } from '@mastra/core/mastra'
import { serve as inngestServe } from '@mastra/inngest'
import { createLogger } from '@mastra/core/logger'
import { incrementWorkflow } from './workflows'
import { VercelDeployer } from '@mastra/deployer-vercel'
import { inngest } from './inngest'


export const mastra = new Mastra({
  vnext_workflows: {
    incrementWorkflow,
  },
  server: {
    host: '0.0.0.0',
    apiRoutes: [
      {
        path: '/api/inngest',
        method: 'ALL',
        createHandler: async ({ mastra }) => inngestServe({ mastra, inngest }),
      },
    ],
  },
  logger: createLogger({
    name: 'Mastra',
    level: 'info',
  }),
  deployer: new VercelDeployer({
    teamSlug: "manthanguptaas-projects",
    projectName: "inngest-project",
    token: "gtBT8E7RxQ8ZMNHSjKZ1etLK",
  }),
})
