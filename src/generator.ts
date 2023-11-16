/* eslint-disable @typescript-eslint/naming-convention */
import * as prompts from './prompts';
import { Configuration, CreateCompletionResponse, OpenAIApi } from 'openai';
import * as fs from 'fs';
import { getState } from './state';
import axios from 'axios';

const ALWAYS_INCLUDE_FILENAME = true;


let mapExtensionStartInstall: any = {
    'js': 'npm install',
    'ts': 'npm install',
    'py': 'pip install',
    'java': 'mvn install',
    'go': 'go install',
    'php': 'composer install',
};

function getOpenAI() {
    const configuration = new Configuration({
        apiKey: getState().get('apiKey'),
    });

    const openai = new OpenAIApi(configuration);
    return openai;
}


function generateUnitTestPrompt(code: string): string {
    return `Generate code for a maximum of 5 unit tests for the following code, \
            The returned code must contain all the necessary imports and must run without errors and \
            you must only return code no extra comments from you, \
            The code should be returned as a string:
    \`\`\`
    ${code}
    \`\`\``;
}

export async function callOpenAI(code: string, model: string = "gpt-3.5-turbo-instruct", maxTokens: number = 500, temperature: number = 0): Promise<string> {
    // Retrieve the apiKey from your state management
    const OPENAI_API_KEY = getState().get('apiKey');
    let prompt = generateUnitTestPrompt(code);
    console.log(prompt)
    // Rest of your function remains the same
    const response = await axios.post('https://api.openai.com/v1/completions', {
        model: model,
        prompt: generateUnitTestPrompt(prompt),
        max_tokens: maxTokens,
        temperature: temperature
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
        }
    });

    return response.data.choices[0].text;
}

async function callOpenAIEdit(engine: string, input: string, instruction: string): Promise<any | null> {
    let openai = getOpenAI();
    try {
        const response = await openai.createEdit(engine, {
            input: input,
            instruction: instruction,
            temperature: 0,
            top_p: 1,
        });

        // Extracting the data from the response and returning it as a simple object
        return response?.data.choices?.[0]?.text;;
    } catch (e) {
        return null;
    }
}

async function generateUntilDone(engine: string, prompt: string, input: any): Promise<string> {
    let generatedCode = '';
    let isEdit = engine.indexOf('edit') !== -1;
    while (true) {
        let response = null;
        if (isEdit) {
            response = await callOpenAIEdit(engine, prompt, input.variables.command);
            console.log("SAMPLE RESPONSE", response)
        } else {
            response = await callOpenAI(input.variables.code);
            // response = await callOpenAIEdit(engine, prompt, input.variables.command);
        }
        // let textCode = response?.data.choices?.[0]?.text;
        let textCode = response;
        if (textCode === undefined) {
            break;
        }
        // Break if empty
        if (textCode.trim().length === 0) {
            break;
        }
        generatedCode += textCode;
        if (isEdit){
            return generatedCode;
        }
        // Call again appending prompt
        prompt = `${prompt}\n${textCode}`;
        if (textCode.endsWith("\n")) {
            break;
        }
        break;
    }
    return generatedCode;
}

async function generate(input: any): Promise<string> {
    let prompt = await prompts.build(input.file, input.variables);
    let result = await generateUntilDone(input.engine, prompt, input);
    return result;
}

function getIntroText(command: any) {
    let texts = [
        'Your wish is my command',
        'Here we go!'
    ];
    let preText = texts[0] + '\n';
    preText += 'Your command: ' + command.text + '\n';

    if (command.type === 'create') {
        preText += 'I will create the following files:';
    } else {
        preText += 'I will modify the following files:';
    }
    return preText;
}

async function getExistingFileCode(file: string, folder: string) {
    if (file.startsWith('/')) {
        return fs.readFileSync(file, 'utf8');
    }
    // Check if file exists
    let filePath = folder + '/' + file;
    if (!fs.existsSync(filePath)) {
        return '';
    }
    return fs.readFileSync(folder + '/' + file, 'utf8');
}

const getFilesRecursively = (path: string) => {
    const files = [];
    for (const file of fs.readdirSync(path)) {
        const fullPath = path + '/' + file;
        if(fs.lstatSync(fullPath).isDirectory()) {
            getFilesRecursively(fullPath).forEach(x => files.push(file + '/' + x));
        }
        else {
            files.push(file);
        }
    }
    return files;
};

async function getExistingFiles(folder: string) {
    // List files recursively ignoring hidden files and some extensions
    const ignoreExtensions = [
        '.git',
        '.gitignore',
        '.gitmodules',
        '.DS_Store',
        '.idea',
        '.vscode',
        '.vscodeignore',
        '.txt',
        '.md',
        '.json',
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.svg',
        '.ico',
        '.ai/',
    ];

    let files = getFilesRecursively(folder);

    // Filter out files
    files = files.filter(file => {
        // Ignore hidden files
        if (file.startsWith('.')) {
            return false;
        }
        // Ignore files with extensions
        for (const ext of ignoreExtensions) {
            if (file.endsWith(ext)) {
                return false;
            }
        }
        return true;
    });
    return files;
}

async function getVariablesAndPromptForCommand(generationType: string, command: any) : Promise<any> {
    let variables: any = {};
    variables.command = command.command;
    let promptFile = '';
    let engine = 'code-davinci-002';

    if (generationType === 'files') {
        if (command.type === 'modify') {
            variables.files = await getExistingFiles(command.folder);
            promptFile = 'modify-' + generationType;
            engine = 'text-davinci-002';
        } else if (command.type === 'create') {
            promptFile = 'create-' + generationType;
            engine = 'text-davinci-002';
        }
    } else if (generationType === 'code') {
        if (command.type === 'modify') {
            variables.file = command.file;
            variables.code = await getExistingFileCode(variables.file, command.folder);
            promptFile = 'modify-' + generationType;
            engine = 'code-davinci-edit-001';
        } else if (command.type === 'create') {
            promptFile = 'create-' + generationType;
            engine = 'code-davinci-002';
        } else if (command.type === 'install') {
            variables.file = command.file;
            promptFile = 'install-' + generationType;
            engine = 'code-davinci-002';
            variables.code = await getExistingFileCode(variables.file, command.folder);
        }
        else if (command.type === 'edit') {
            variables.file = command.file;
            variables.code = await getExistingFileCode(variables.file, command.folder);
            promptFile = 'edit-' + generationType;
            engine = 'code-davinci-edit-001';
            if (variables.code.trim().length === 0 || ALWAYS_INCLUDE_FILENAME) {
                // Add file name to command
                let fileName = variables.file.split('/').pop();
                variables.command = `${variables.command}\nfile: ${fileName}`;
            }
        } else if (command.type === 'test') {
            variables.file = command.file;
            variables.code = await getExistingFileCode(variables.file, command.folder);
            promptFile = 'test-' + generationType;
            engine = 'code-davinci-002';
            if (variables.code.trim().length === 0) {
                // Add file name to command
                let fileName = variables.file.split('/').pop();
                variables.command = `${variables.command}\nfile: ${fileName}`;
            }
        }
    }
    return {
        'file': promptFile,
        'engine': engine,
        'variables': variables,
    };
}

export async function generateFilesToModify(command: any) {
    let variables: any = {};
    let infoText = getIntroText(command);

    // Build variables
    let input = await getVariablesAndPromptForCommand('files', command);
    let result = await generate(input);

    return {
        'code': infoText + '\n' + result,
        'files': []
    };
}

function mapFileToStart(filename: string, mapExtension: any) {
    let extension = filename.split('.').pop();
    if (!extension) {
        throw new Error('File has no extension');
    }

    if (typeof mapExtension[extension] === 'undefined') {
        throw new Error('File extension not supported');
    }

    return mapExtension[extension];
}

export async function generateCode(command: any, file: string) {
    let input = await getVariablesAndPromptForCommand('code', command);

    input.variables.file = file;

    if (command.type === 'test') {
        input.variables.start = "\n";
    }
    if (command.type === 'install') {
        let start = mapFileToStart(file, mapExtensionStartInstall);
        input.config = {
            stop: '\n'
        };
        input.variables.start =  start;
    }
    let result = await generate(input);
    console.log("RESULT: ", result)

    if (command.type === 'test' || command.type === 'install') {
        // Prepend code with start
        result = input.variables.start + result;
    }
    return result;
}

function generateInstallCommandPrompt(code: string): string {
    return `Return the correct one-line command to install the dependencies needed in the following code:
    \`\`\`
    ${code}
    \`\`\``;
}

export async function getInstallCommand(prompt: string, context: any, model: string = "gpt-3.5-turbo-instruct", maxTokens: number = 500, temperature: number = 0): Promise<string> {
    // Retrieve the apiKey from your state management
    const OPENAI_API_KEY = context.globalState.get("openaiApiKey");
    // Rest of your function remains the same
    const response = await axios.post('https://api.openai.com/v1/completions', {
        model: model,
        prompt: generateInstallCommandPrompt(prompt),
        max_tokens: maxTokens,
        temperature: temperature
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
        }
    });

    return response.data.choices[0].text;
}
