import { promptUserForFolders } from "./utils";
import { mastra } from "./";

const ghRepoUrl = "https://github.com/manthanguptaa/CricLang";
const run = mastra.vnext_getWorkflow("readmeGeneratorWorkflow").createRun();
const res = await run.start({ inputData: { repoUrl: ghRepoUrl } });
const { status, steps } = res;

if (status === "suspended") {
  // Get the suspended step data
  const suspendedStep = steps["select_folder"];
  let folderList: string[] = [];

  if (
    suspendedStep.status === "suspended" &&
    "folders" in suspendedStep.payload
  ) {
    folderList = suspendedStep.payload.folders as string[];
  } else if (suspendedStep.status === "success" && suspendedStep.output) {
    folderList = suspendedStep.output;
  }

  if (!folderList.length) {
    console.log("No folders available for selection.");
    process.exit(1);
  }

  const folders = await promptUserForFolders(folderList);

  const resumedResult = await run.resume({
    resumeData: { selection: folders },
    step: "select_folder",
  });

  // Print resumed result
  if (resumedResult.status === "success") {
    console.log(resumedResult.result);
  } else {
    console.log(resumedResult);
  }
  process.exit(1);
}

if (res.status === "success") {
  console.log(res.result ?? res);
} else {
  console.log(res);
}
