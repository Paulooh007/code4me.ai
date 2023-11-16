import * as vscode from 'vscode';

const template =
`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: Arial, sans-serif; /* Consistent font */
        }
        #generateButton, #fixButton, #explainButton {
            border-radius: 5px; /* Rounded corners */
            transition: background-color 0.3s; /* Smooth transition for hover effect */
        }
        #generateButton:hover, #fixButton:hover, #explainButton:hover {
            opacity: 0.9; /* Slightly change opacity on hover */
        }
        #generateButton:active, #fixButton:active, #explainButton:active {
            opacity: 0.8; /* More change in opacity on active */
        }
        #generateButton {
            background-image: linear-gradient(to right, #4facfe, #00f2fe); /* Gradient background */
            border: none;
            color: white;
            padding: 12px 20px; /* Increased padding */
            text-align: center;
            text-decoration: none;
            display: block; /* Changed to block */
            font-size: 16px;
            margin: 5px 0 5px; /* Increased margin */
            cursor: pointer;
            width: 100%;
            box-sizing: border-box;
        }
        textarea {
            width: 100%;
            resize: vertical;
            box-sizing: border-box;
            font-family: inherit; /* Inherited font style */
			font-size: 12px;
            padding: 10px; /* Added padding */
            border: 1px solid #ccc; /* Added border */
            border-radius: 5px; /* Added border radius */
            min-height: 100px; /* Adjusted height */
            margin-bottom: 10px; /* Added margin */
        }
        #fixButton, #explainButton {
            font-size: 14px; /* Adjusted font size */
            background-color: #b8383d;
            border: none;
            color: white;
            padding: 12px 20px; /* Adjusted padding */
            text-align: center;
            text-decoration: none;
            display: inline-block;
            margin: 4px 0px;
            cursor: pointer;
            width: calc(50% - 3px); /* Adjusted width */
            box-sizing: border-box;
        }
        .buttonContainer {
            display: flex;
            gap: 6px;
        }
    </style>
</head>
<body>
    <textarea placeholder="Instruct the AI: Your wish is its command.. (e.g Write a function to check for even numbers)" id="input"></textarea>
    <button id="generateButton">Generate</button>
    <div class="buttonContainer">
        <button id="fixButton">Fix error</button>
        <button id="explainButton">Explain error</button>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        const fixButton = document.getElementById('fixButton');
        const explainButton = document.getElementById('explainButton');
        const input = document.getElementById('input');

        function sendMessageFix() {
            vscode.postMessage({
                command: 'fix',
                text: input.value
            })
        }

        function sendMessageExplain() {
            vscode.postMessage({
                command: 'explain',
                text: input.value
            })
        }

        // Send message when clicking button
        fixButton.addEventListener('click', sendMessageFix);
        explainButton.addEventListener('click', sendMessageExplain);

        const button = document.getElementById('generateButton');

        function sendMessage() {
            vscode.postMessage({
                command: 'edit',
                text: input.value
            })
        }

        // Send message when clicking button
        button.addEventListener('click', sendMessage);

        window.addEventListener('message', event => {
            const message = event.data; // The JSON data our extension sent

            switch (message.command) {
                case 'clear':
                    // Clear input
                    input.value = '';
                    break;
            }
        });
    </script>
</body>
</html>

`;

class HumanAILoopView implements vscode.WebviewViewProvider {

	public static readonly viewType = 'codegen.editing';

	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
	) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
		};

		webviewView.webview.html = template;

		webviewView.webview.onDidReceiveMessage(
			(message: any) => {
				switch (message.command) {
					case 'edit':
						vscode.commands.executeCommand('codegen.edit', message.text);
						return;
					case 'fix':
						message.text ='Fix this error: ' + message.text;
						vscode.commands.executeCommand('codegen.edit', message.text);
						return;
					case 'explain':
						message.text ='Add an inline comments to where the error is, explaining the exact reason for this error: ' + message.text;
						vscode.commands.executeCommand('codegen.edit', message.text);
						return;
				}
			});
	}

	public clearInput() {
		if (this._view) {
			this._view.webview.postMessage({ command: 'clear' });
		}
	}
}
export default HumanAILoopView;
