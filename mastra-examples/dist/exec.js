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
Object.defineProperty(exports, "__esModule", { value: true });
const _1 = require("./");
const prompts_1 = require("@inquirer/prompts");
const human_in_the_loop_workflow_1 = require("./workflows/human-in-the-loop-workflow");
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const workflow = _1.mastra.vnext_getWorkflow('travelAgentWorkflow');
        const run = workflow.createRun({});
        const result = yield run.start({
            inputData: { vacationDescription: 'I want to go to the beach' },
        });
        console.log('result', result);
        const suggStep = (_a = result === null || result === void 0 ? void 0 : result.steps) === null || _a === void 0 ? void 0 : _a['generate-suggestions'];
        if (suggStep.status === 'success') {
            const suggestions = (_b = suggStep.output) === null || _b === void 0 ? void 0 : _b.suggestions;
            const userInput = yield (0, prompts_1.select)({
                message: "Choose your holiday destination",
                choices: suggestions.map(({ location, description }) => `- ${location}: ${description}`)
            });
            console.log('Selected:', userInput);
            console.log('resuming from', result, 'with', {
                inputData: {
                    selection: userInput,
                    vacationDescription: 'I want to go to the beach',
                    suggestions: (_c = suggStep === null || suggStep === void 0 ? void 0 : suggStep.output) === null || _c === void 0 ? void 0 : _c.suggestions,
                },
                step: human_in_the_loop_workflow_1.humanInputStep,
            });
            const result2 = yield run.resume({
                resumeData: {
                    selection: userInput,
                },
                step: human_in_the_loop_workflow_1.humanInputStep,
            });
            console.dir(result2, { depth: null });
        }
    });
}
main();
