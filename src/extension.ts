import * as vscode from 'vscode';
import * as codegen from './codegen';
import * as generator from './generator';
import HumanAILoopView from './views';
import { getState } from './state';
import * as path from 'path';
import { promises as fs } from 'fs';


async function editCode(context: vscode.ExtensionContext, text:string) {
	if (getState().isGenerating()) {
		// Show error message
		vscode.window.showErrorMessage('Code is still being generated.');
		return;
	}
	// Show error message if text( trim) is empty
	if (text.trim() === '') {
		vscode.window.showErrorMessage('Please enter a valid instruction.');
		return;
	}
	// Add status bar item and wait for click
	if (!vscode.window.activeTextEditor) {
		vscode.window.showErrorMessage('No file is current opened in the editor.');
		return;
	}
	let currentFolder = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)?.uri.fsPath;
	if (!currentFolder) {
		return;
	}
	let currentFile = vscode.window.activeTextEditor.document.fileName;

	await codegen.edit(context, getState(), text, currentFile, currentFolder);
}

function generateInstallCommandPrompt(code: string): string {
	return `Return the correct one-line command to install the dependencies needed in the following code \
	if no external dependencies are needed, return "None":
    \`\`\`
    ${code}
    \`\`\``;
}

function generateDocumentationPrompt(code: string): string {
	return `Generate a good readme for the following code, \
	It should include all the elements of a good readme and documentation best practices, \
	return only the content of the readme as markdown, \
	no extra comments from you:
    \`\`\`
    ${code}
    \`\`\``;
}

export function activate(context: vscode.ExtensionContext) {
	const provider = new HumanAILoopView(context.extensionUri);
	context.subscriptions.push(vscode.window.registerWebviewViewProvider(HumanAILoopView.viewType, provider));

	context.subscriptions.push(vscode.commands.registerCommand('codegen.edit', (text) => {
		editCode(context, text);
	}));
	// 	documentCode(context, text);
	// }));

	context.subscriptions.push(vscode.commands.registerCommand('codegen.docs', async () => {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) {
			return;
		}
	
		const currentFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri)?.uri.fsPath;
		if (!currentFolder) {
			return;
		}
	
		const currentFile = activeEditor.document.fileName;
	
		const currentFilenameBase = path.basename(currentFile, path.extname(currentFile));
		const docsFolderPath = path.join(currentFolder, 'docs');
		const mdFilePath = path.join(docsFolderPath, `readme_${currentFilenameBase}.md`);
	
		try {
			await fs.mkdir(docsFolderPath, { recursive: true });
			const content = await generator.getOpenAIResponse(generateDocumentationPrompt(currentFile), context); // Adjust as per your implementation
			await fs.writeFile(mdFilePath, content);
	
			vscode.window.showInformationMessage('Documentation generated successfully.');
		} catch (error) {
			vscode.window.showErrorMessage(`Error generating documentation: ${error instanceof Error ? error.message : String(error)}`);
		}
	}));


	context.subscriptions.push(vscode.commands.registerCommand('codegen.humanailoop.accept', async () => {
		await codegen.accept(getState());
		provider.clearInput();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('codegen.humanailoop.cancel', async () => {
		await codegen.cancel(getState());
	}));

	context.subscriptions.push(vscode.commands.registerCommand('codegen.install', async () => {
		if (getState().isGenerating()) {
			return;
		}
		if (!vscode.window.activeTextEditor) {
			return;
		}
		let currentFileText = vscode.window.activeTextEditor.document.getText();
	
		getState().startGenerating();
		getState().bar.loading.show();
		let code = '';
		try {
			code = await generator.getOpenAIResponse(generateInstallCommandPrompt(currentFileText), context);
		} catch (e) {
			vscode.window.showErrorMessage('Error generating code.');
			console.log(e);
			getState().endGenerating();
			getState().bar.loading.hide();
			return;
		} finally {
			getState().endGenerating();
			getState().bar.loading.hide();
		}
	
		// Check if the code is 'None'
		if (code.trim().toLowerCase() === 'none') {
			vscode.window.showInformationMessage('No installation needed.');
			return;
		}
	
		// Ensure code ends with a newline
		if (!code.endsWith('\n')) {
			code += '\n';
		}
	
		// Focus on the terminal and send the generated command
		const terminal = vscode.window.activeTerminal || vscode.window.createTerminal();
		terminal.show();
		terminal.sendText(code, true); // 'true' means the text is executed (like pressing Enter)
	}));
	
	

	context.subscriptions.push(vscode.commands.registerCommand('codegen.generate', async () => {
		if (getState().isLooping()) {
			vscode.window.showInformationMessage('Generation is already in progress.');
			return;
		}
		// Add status bar item and wait for click
		if (!vscode.window.activeTextEditor) {
			return;
		}
		// Show a message box to the user with loading animation
		let loading = vscode.window.setStatusBarMessage('Generating code...');
		let currentFile = vscode.window.activeTextEditor.document.fileName;
		await codegen.generate(context, getState(), currentFile);
		// Hide message box
		loading.dispose();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('codegen.tests', async () => {
		// Add status bar item and wait for click
		if (!vscode.window.activeTextEditor) {
			return;
		}
		let currentFolder = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)?.uri.fsPath;
		if (!currentFolder) {
			return;
		}

		let currentFile = vscode.window.activeTextEditor.document.fileName;
		await codegen.generateTests(context, getState(), currentFile, currentFolder);
	}));
}

// this method is called when your extension is deactivated
export function deactivate() { }
