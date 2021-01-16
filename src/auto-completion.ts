import * as vscode from 'vscode'


/** 
 * Do auto completion and inserting for:
 * `=${}`
 */
export function autoCompletion(event: vscode.TextDocumentChangeEvent): void {
	if (!event.contentChanges[0]) {
		return
	}

	if (isTypeScriptLanguage(event.document.languageId) && event.contentChanges[0].text === '$') {
		autoInserting()
	}
}


function isTypeScriptLanguage(languageId: string) {
	return languageId === 'typescript' || languageId === 'typescriptreact'
}


async function autoInserting() {
	let editor = vscode.window.activeTextEditor
	if (!editor) {
		return
	}

	// Cursor is here: `=|$`.
	let document = editor.document
	let selection = editor.selection
	let currentLine = document.lineAt(selection.active).text
	let currentTwoChars = currentLine.slice(selection.active.character - 1, selection.active.character + 1)

	if (currentTwoChars === '=$') {
		let insertPosition = selection.active.translate(0, 1)

		// Insert `{}` after `=$`.
		await editor.edit(editBuilder => {
			editBuilder.insert(insertPosition, '{}')
		})

		// Moves cursor to `{|}`
		let cursorPosition = insertPosition.translate(0, 1)
		editor.selection = new vscode.Selection(cursorPosition, cursorPosition)
	}
}

