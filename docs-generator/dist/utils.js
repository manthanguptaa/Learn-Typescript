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
exports.promptUserForFolders = promptUserForFolders;
function promptUserForFolders(folderList) {
    return __awaiter(this, void 0, void 0, function* () {
        folderList.forEach((folder) => console.log(`- ${folder}`));
        console.log("- * (All folders)");
        const readline = require("readline").createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        return new Promise((resolve) => {
            readline.question("Enter folder names separated by comma (or * for all): ", (answer) => {
                readline.close();
                resolve(answer.split(",").map((f) => f.trim()));
            });
        });
    });
}
