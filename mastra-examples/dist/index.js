"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mastra = void 0;
const mastra_1 = require("@mastra/core/mastra");
const logger_1 = require("@mastra/core/logger");
const human_in_the_loop_workflow_1 = require("./workflows/human-in-the-loop-workflow");
const travel_agent_1 = require("./agents/travel-agent");
const mastra = new mastra_1.Mastra({
    vnext_workflows: {
        travelAgentWorkflow: human_in_the_loop_workflow_1.travelAgentWorkflow,
    },
    agents: {
        travelAgent: travel_agent_1.travelAgent,
        summaryTravelAgent: travel_agent_1.summaryTravelAgent
    },
    logger: (0, logger_1.createLogger)({
        name: 'Mastra',
        level: 'info',
    }),
});
exports.mastra = mastra;
