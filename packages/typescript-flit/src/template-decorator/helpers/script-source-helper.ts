
import * as ts from 'typescript/lib/tsserverlibrary'
import {getNodeAtOffset} from '../../ts-utils/ast-utils'


export default class ScriptSourceHelper {
	constructor(
		private readonly project: ts.server.Project
	) {}

	/** Get node at the specified offset of source file. */
	getNodeAtOffset(fileName: string, offset: number) {
		let sourceFile = this.getSourceFile(fileName)
		return sourceFile ? getNodeAtOffset(sourceFile, offset) : null
	}

	/** Get source file from name. */
	getSourceFile(fileName: string) {
		let program = this.getProgram()
		return program?.getSourceFile(fileName)
	}

	private getProgram() {
		return this.project.getLanguageService().getProgram()
	}

	/** Get line and character position at the specified offset of source file. */
	getPosition(fileName: string, offset: number): ts.LineAndCharacter {
		let scriptInto = this.project.getScriptInfo(fileName)
		if (!scriptInto) {
			return {line: 0, character: 0}
		}

		let location = scriptInto.positionToLineOffset(offset)
		return {line: location.line - 1, character: location.offset - 1}
	}

	/** Get offset at the specified line and character of source file. */
	getOffset(fileName: string, {line, character}: ts.LineAndCharacter) {
		let scriptInto = this.project.getScriptInfo(fileName)
		if (!scriptInto) {
			return 0
		}

		return scriptInto.lineOffsetToPosition(line + 1, character + 1)
	}
}