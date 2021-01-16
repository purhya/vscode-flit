import * as vscode from 'vscode'
import {autoCompletion} from './auto-completion'


/** Output interface to activate plugin. */
export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument(event => {
			autoCompletion(event)
		})
	)
}

/** Output interface to deactivate plugin. */
export function deactivate() {}
