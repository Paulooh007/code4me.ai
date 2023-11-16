import * as parser from './parser';
import * as generator from './generator';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { getState } from './state';

const doneText = '[x]';
const generatedFolder = '/.ai/';
const apiKeyName = 'openaiApiKey';

async function getPendingCommands(commands: string[]): Promise<string[]> {
    return commands.filter(command => {
        return !command.includes(doneText);
    });
}

async function markCommandAsDone(command: any, filePath: string) {
    let inputText = fs.readFileSync(filePath, 'utf8');
    inputText = inputText.replace(command.text, command.text + ' ' + doneText);
    fs.writeFileSync(filePath, inputText);
}

async function saveResult(currentFolder: string, result: string, outputFileName: string): Promise<string> {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(currentFolder + generatedFolder)) {
            fs.mkdirSync(currentFolder + generatedFolder, { recursive: true });
        }
        let files = fs.readdirSync(currentFolder + generatedFolder);
        let index = 0;
        for (let i = 0; i < files.length; i++) {
            if (files[i].endsWith('.codegen')) {
                let fileName = files[i].split('.')[0];
                let fileIndex = parseInt(fileName.split('gen')[1]);
                if (fileIndex > index) {
                    index = fileIndex;
                }
            }
        }

        let filePath = currentFolder + generatedFolder + outputFileName;

        fs.writeFile(filePath, result, (err) => {
            if (err) {
                reject(err);
            }
            resolve(filePath);
        });
    });
}

async function saveToFileAndShowResult(currentFolder: string, result: string, outputFileName: string): Promise<string> {
    let filePath = await saveResult(currentFolder, result, outputFileName);
    // Open the file
    return vscode.workspace.openTextDocument(vscode.Uri.file(filePath)).then(document => {
        vscode.window.showTextDocument(document);
    }).then(() => {
        // Return the file path
        return filePath;
    });
}

async function checkAPIKey(context: vscode.ExtensionContext): Promise<boolean> {
    let apiKey = context.globalState.get(apiKeyName);
    if (!apiKey) {
        let apiKey = await vscode.window.showInputBox({
            prompt: 'Please enter your OpenAI API Key. You need to have access to Codex models.',
            placeHolder: 'API Key'
        });
        if (!apiKey) {
            vscode.window.showErrorMessage('No OpenAI API Key provided. Please enter your API Key');
            return false;
        }
        context.globalState.update(apiKeyName, apiKey);
    }
    apiKey = context.globalState.get(apiKeyName);
    getState().set('apiKey', apiKey);
    return true;
}

async function generateNextCode(state: any) {
    let processing = state.get('processing');
    state.startGenerating();
    let code: string = '';
    let hasError = false;

    try {
        console.log("processing.cmd: ", processing.command);
        code = await generator.generateCode(processing.command, processing.files[processing.index]);
        // console.log("processing.cmd: ", processing.command);`
        console.log("CODE: ", code);
    } catch(e) {
        vscode.window.showErrorMessage('Error generating code. ' + e);
        state.finish();
        state.endGenerating();
        return false;
    } finally {
        state.endGenerating();
    }
    if (hasError) {
        return false;
    }

    // Check if file exists in current folder if exists show diff else show code
    let currentFolder = processing.currentFolder;
    let filePath = processing.files[processing.index];
    if (!filePath.startsWith('/')) {
        filePath = currentFolder + '/' + filePath;
    }
    let fileName = filePath.split('/').pop();

    let generatedFilePath = null;
    if (fs.existsSync(filePath)) {
        generatedFilePath = await saveResult(currentFolder, code, fileName);
        await vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(filePath), vscode.Uri.file(generatedFilePath));
    } else {
        generatedFilePath = await saveToFileAndShowResult(processing.currentFolder, code, fileName);
    }
    processing.codeFilePath = generatedFilePath;
    state.set('processing', processing);
    state.nextItem();
    return true;
}

export async function cancel(state: any) {
    let processing = state.get('processing');
    if (processing && processing.codeFilePath) {
        // Move to generated subfolder (same level as original)
        let filePath = processing.codeFilePath;
        let fileName = filePath.split('/').pop();
        let folder = filePath.split('/').slice(0, -1).join('/');
        let generatedFolder = folder + '/generated/';
        if (!fs.existsSync(generatedFolder)) {
            fs.mkdirSync(generatedFolder, { recursive: true });
        }
        let newFilePath =  generatedFolder+ fileName;
        fs.renameSync(filePath, newFilePath);
    }
    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    state.stopLooping();
}

function applyChanges(processingState: any) {
    // If file exists, replace it with the generated code else create a new file and paste the code
    let currentFolder = processingState.currentFolder;
    let file = processingState.files[processingState.index - 1];
    let filePath = file;
    if (!filePath.startsWith('/')) {
        filePath = currentFolder + '/' + filePath;
    }
    let code = fs.readFileSync(processingState.codeFilePath, 'utf8');
    // Move processingState.codeFilePath to subfolder generated on the same level as the file
    let codeFileFolder = processingState.codeFilePath.split('/');
    codeFileFolder.pop();
    codeFileFolder.push('generated');
    codeFileFolder = codeFileFolder.join('/');

    if (!fs.existsSync(codeFileFolder)) {
        fs.mkdirSync(codeFileFolder, { recursive: true });
    }
    let codeFileName = processingState.codeFilePath.split('/').pop();
    let codeFilePath = codeFileFolder + '/' + codeFileName;
    fs.renameSync(processingState.codeFilePath, codeFilePath);

    if (fs.existsSync(filePath)) {
        // Replace the file with the generated code
        fs.writeFileSync(filePath, code);
    } else {
        // Create file folder recursively if not exists
        let fileFolder = filePath.split('/');
        fileFolder.pop();
        let folderPath = fileFolder.join('/');
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }
        // Create a new file and paste the code
        fs.writeFileSync(filePath, code);
    }
}

export async function accept(state: any) {
    let processing = state.get('processing');
    let status = false;
    if (processing.state === 'files') {
        processing.state = 'code';
        state.set('processing', processing);
        status = await generateNextCode(state);
        state.bar.loading.hide();
        if (status) {
            state.bar.cancel.show();
            state.bar.accept.show();
        }
    } else {
        applyChanges(processing);
        if (processing.index >= processing.files.length) {
            state.finish();
            return;
        }
        status = await generateNextCode(state);
    }
    return status;
}

async function startHumanAILoop(command: any, currentFolder: string, state: any) {
    command.folder = currentFolder;
    if (command.type === 'test') {
        let fileName = command.file.split('/').pop();
        let testsFolder = currentFolder + '/tests/';
        let unitTestFile = testsFolder + fileName;
        if (!fs.existsSync(testsFolder)) {
            fs.mkdirSync(testsFolder, { recursive: true });
        }
        // Create empty file (if not exists)
        if (!fs.existsSync(unitTestFile)) {
            fs.writeFileSync(unitTestFile, '');
        }

        state.set('processing', {
            'state': 'files',
            'command': command,
            'currentFolder': currentFolder,
            'files': [
                unitTestFile
            ],
            'index': 0
        });
        state.bar.loading.show();
        await accept(state);
        return;
    } else if (command.type === 'edit') {
        state.set('processing', {
            'state': 'files',
            'command': command,
            'currentFolder': currentFolder,
            'files': [
                command.file
            ],
            'index': 0
        });
        state.bar.loading.show();
        await accept(state);
        return;
    } else {
        let result = await generator.generateFilesToModify(command);
        await saveToFileAndShowResult(currentFolder, result.code, 'files.md');
        state.set('processing', {
            'state': 'files',
            'command': command,
            'currentFolder': currentFolder,
            'files': result.files,
            'index': 0
        });
    }

    state.startLooping();
    state.bar.loading.show();
    await state.waitEndLooping();
}

export async function generate(context: vscode.ExtensionContext, state: any, currentFile: string) {
    if (!await checkAPIKey(context)) {
        return;
    }

    let currentFolder = currentFile.substring(0, currentFile.lastIndexOf('/'));
    let inputText = fs.readFileSync(currentFile, 'utf8');
    let commands = await parser.parse(inputText);
    let pendingCommands = await getPendingCommands(commands);
    // Show message box to the user if there are no pending commands
    if (pendingCommands.length === 0) {
        vscode.window.showInformationMessage('No pending commands');
        return;
    }

    let firstPendingCommand = pendingCommands[0];
    let command = parser.getCommandWithType(firstPendingCommand);
    await startHumanAILoop(command, currentFolder, state);
    await markCommandAsDone(command, currentFile);
}

export async function generateTests(context: vscode.ExtensionContext, state: any, currentFile: string, currentFolder: string) {
    if (!await checkAPIKey(context)) {
        return;
    }

    let command = {
        'type': 'test',
        'file': currentFile,
    };
    await startHumanAILoop(command, currentFolder, state);
}

export async function edit(context: vscode.ExtensionContext, state: any, commandText: string, fileToEdit: string, currentFolder: string) {
    if (!await checkAPIKey(context)) {
        return;
    }

    let command = {
        'type': 'edit',
        'command': commandText,
        'file': fileToEdit,
    };
    await startHumanAILoop(command, currentFolder, state);
}