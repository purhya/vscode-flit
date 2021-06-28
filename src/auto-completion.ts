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


interface AutoInsertingItem {

	/** From string `=$`. */
	from: string

	/** Cursor offset after inserting. */
	cursorOffset: number

	/** Insert string `{}` */
	insert: string
}

// May upgrade to `auto replacing items` to be more magic.
const AutoInsertingItems: AutoInsertingItem[] = [
	{
		from: '=$',
		cursorOffset: 1,
		insert: '{}',
	},
	{
		from: '>$',
		cursorOffset: 1,
		insert: '{}',
	}
]


async function autoInserting() {
	let editor = vscode.window.activeTextEditor
	if (!editor) {
		return
	}

	// Cursor is here: `=|$`.
	let document = editor.document
	let selection = editor.selection
	let currentLine = document.lineAt(selection.active).text

	for (let {from, insert, cursorOffset} of AutoInsertingItems) {
		let leftChars = currentLine.slice(selection.active.character - from.length + 1, selection.active.character + 1)
		if (leftChars === from) {
			let insertPosition = selection.active.translate(0, 1)

			// Insert `{}` after `=$`.
			await editor.edit(editBuilder => {
				editBuilder.insert(insertPosition, insert)
			})

			// Moves cursor to `{|}`
			let cursorPosition = insertPosition.translate(0, cursorOffset)
			editor.selection = new vscode.Selection(cursorPosition, cursorPosition)

			break
		}
	}
}

