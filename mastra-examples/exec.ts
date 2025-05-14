import { mastra } from "./"
import { select } from '@inquirer/prompts'
import { humanInputStep } from './workflows/human-in-the-loop-workflow'
 
 
async function main() {
const workflow = mastra.vnext_getWorkflow('travelAgentWorkflow')
const run = workflow.createRun({})
const result = await run.start({
  inputData: { vacationDescription: 'I want to go to the beach' },
})
 
console.log('result', result)
 
const suggStep = result?.steps?.['generate-suggestions']
 
if (suggStep.status === 'success') {
  const suggestions = suggStep.output?.suggestions
  const userInput = await select<string>({
    message: "Choose your holiday destination",
    choices: suggestions.map(({ location, description }: { location: string, description: string }) => `- ${location}: ${description}`)
  })
 
  console.log('Selected:', userInput)
 
  console.log('resuming from', result, 'with', {
    inputData: {
      selection: userInput,
      vacationDescription: 'I want to go to the beach',
      suggestions: suggStep?.output?.suggestions,
    },
    step: humanInputStep,
  })
 
  const result2 = await run.resume({
    resumeData: {
      selection: userInput,
    },
    step: humanInputStep,
  })
 
  console.dir(result2, { depth: null })
}
}

main();
