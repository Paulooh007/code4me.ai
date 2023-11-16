const fs = require('fs');

let createCode =
`Modify code for the following file:
$file
to implement the following command:
$command`;

let createFiles =
`Generate project scaffolding (list of file names and folders) to implement the following feature:
FEATURE:
$command
Include only server files and views. Include folders if necessary (e.g, models/model.js).
FILES:
- $exampleFile
-`;

let modifyCode =
`Modify the following file:
$code
to implement the following command:
$command`;

let modifyFiles =
`I will modify an app using the following context:
$command
$files
RESULTS:`;

let editCode =
`$code`;

let testCode =
`$code
// Create unit tests for code above
$start`;

let installCode =
`$code
// Generate install commands for external packages (use single line of commands).
$start`;

let explainError =
`Add an inline comments to where the error is explaining the exact reason for this error: $command`;

let fixError = `Fix this error: $command`;


let mapPrompts: any = {
    'create-files': createFiles,
    'create-code': createCode,
    'modify-files': modifyFiles,
    'modify-code': modifyCode,
    'edit-code': editCode,
    'test-code': testCode,
    'install-code': installCode,
    'fix-error-code': fixError,
    'explain-error-code': explainError,
};

export async function build(promptFile: string, variables: any): Promise<string> {
    if (typeof variables === 'undefined' || variables === null) {
        variables = {};
    }
    // console.log("variables", variables)
    let template = mapPrompts[promptFile];
    // Replace each variable with the corresponding value
    for (let key in variables) {
        let value = variables[key];
        template = template.replace(`$${key}`, value);
    }
    // console.log(template);
    return template;
}