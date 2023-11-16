import * as vscode from 'vscode';
import * as codegen from './codegen';
import * as generator from './generator';
import HumanAILoopView from './views';
import { getState } from './state';
import { config } from 'process';
import { get } from 'http';

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

function documentCode(context: vscode.ExtensionContext, text:string) {
	text = 'Improve code quality of the code in triple backticks, do this by add docstrings, comments, and refactoring. \
			Return the new code as a string and do not add any extra comments, just code as a string';
	return editCode(context, text);
}

export function activate(context: vscode.ExtensionContext) {
	const provider = new HumanAILoopView(context.extensionUri);
	context.subscriptions.push(vscode.window.registerWebviewViewProvider(HumanAILoopView.viewType, provider));

	context.subscriptions.push(vscode.commands.registerCommand('codegen.edit', (text) => {
		editCode(context, text);
	}));
	context.subscriptions.push(vscode.commands.registerCommand('codegen.docs', (text) => {
		documentCode(context, text);
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
		// Add status bar item and wait for click
		if (!vscode.window.activeTextEditor) {
			return;
		}
		let currentFileText = vscode.window.activeTextEditor.document.getText();

		getState().startGenerating();
		getState().bar.loading.show();
		let code = '';
		try {
			code = await generator.getInstallCommand(currentFileText, context);
		}
		catch (e) {
			vscode.window.showErrorMessage('Error generating code.');
			console.log(e)
			getState().endGenerating();
			getState().bar.loading.hide();
			return;
		}
		getState().endGenerating();
		getState().bar.loading.hide();

		// Get first line only
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
