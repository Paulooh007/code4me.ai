import * as vscode from 'vscode';

let state: any = {};
let barItems: any = null;

function getBarItems() {
	if (barItems !== null) {
		return barItems;
	}
	barItems = {} as any;

	let cancelBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
	cancelBarItem.text = `Cancel`;
	cancelBarItem.hide();
	cancelBarItem.command = 'codegen.humanailoop.cancel';

	barItems['cancel'] = cancelBarItem;

	let acceptBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
	acceptBarItem.text = `Accept`;
	acceptBarItem.hide();
	acceptBarItem.command = 'codegen.humanailoop.accept';

	barItems['accept'] = acceptBarItem;

	// Add loading bar
	let loadingBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
	loadingBarItem.text = `🤖⏳Generating........`;
	loadingBarItem.hide();

	barItems['loading'] = loadingBarItem;

	return barItems;
}

export function getState() {
	return {
		state: state,
		bar: getBarItems(),
		set: function(key: any, value: any) {
			state[key] = value;
		},
		get: function(key: any) {
			if (key in state) {
				return state[key];
			}
			else {
				return null;
			}
		},
		hasFinished(state: any): boolean {
			let processing = this.get('processing');
			if (processing.index > processing.files.length) {
				this.finish();
				return true;
			}
			return false;
		},
		finish() {
			// Close active editor tab
			vscode.commands.executeCommand('workbench.action.closeActiveEditor');
			this.stopLooping();
		},
		nextItem : function() {
			let processing = this.get('processing');
			processing.index++;
			this.set('processing', processing);
			return this.hasFinished(state);
		},
		startLooping: function() {
			state['looping'] = true;
		},
		stopLooping: function() {
			state['looping'] = false;
			state['processing'] = null;
			getBarItems().cancel.hide();
			getBarItems().accept.hide();
			getBarItems().loading.hide();
		},
		waitEndLooping: function() {
			return new Promise<void>((resolve, reject) => {
				// Monitor the state until isLooping is false
				let interval = setInterval(() => {
					if (!state.looping) {
						clearInterval(interval);
						resolve();
					}
				}, 100);
			});
		},
		isLooping: function() {
			return state?.looping;
		},
		isGenerating: function() {
			return state?.generating;
		},
		// Add start and end generating flag
		startGenerating: function() {
			state['generating'] = true;
		},
		endGenerating: function() {
			state['generating'] = false;
		}
	};
}