async function promptUserForFolders(folderList: string[]): Promise<string[]> {
    folderList.forEach((folder) => console.log(`- ${folder}`));
    console.log("- * (All folders)");
  
    const readline = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  
    return new Promise((resolve) => {
      readline.question(
        "Enter folder names separated by comma (or * for all): ",
        (answer: string) => {
          readline.close();
          resolve(answer.split(",").map((f) => f.trim()));
        },
      );
    });
}

export { promptUserForFolders };