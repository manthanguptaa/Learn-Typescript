"use strict";
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
const _1 = require("./");
function runWorkflow() {
  return __awaiter(this, void 0, void 0, function* () {
    var _a;
    const ghRepoUrl = "https://github.com/manthanguptaa/CricLang";
    const run = _1.mastra
      .vnext_getWorkflow("readmeGeneratorWorkflow")
      .createRun();
    const res = yield run.start({ inputData: { repoUrl: ghRepoUrl } });
    const { status, steps } = res;
    if (status === "suspended") {
      // Get the suspended step data
      const suspendedStep = steps["select_folder"];
      let folderList = [];
      if (
        suspendedStep.status === "suspended" &&
        "folders" in suspendedStep.payload
      ) {
        folderList = suspendedStep.payload.folders;
      } else if (suspendedStep.status === "success" && suspendedStep.output) {
        folderList = suspendedStep.output;
      }
      if (!folderList.length) {
        console.log("No folders available for selection.");
        return;
      }
      const folders = yield (0, utils_1.promptUserForFolders)(folderList);
      const resumedResult = yield run.resume({
        resumeData: { selection: folders },
        step: "select_folder",
      });
      // Print resumed result
      if (resumedResult.status === "success") {
        console.log(resumedResult.result);
      } else {
        console.log(resumedResult);
      }
      return;
    }
    if (res.status === "success") {
      console.log((_a = res.result) !== null && _a !== void 0 ? _a : res);
    } else {
      console.log(res);
    }
  });
}
runWorkflow();
