import {getNodeAtOffset} from '../ts-utils/ast-utils'
import {FlitToken, FlitTokenType} from './flit-toker-scanner'
import * as ts from 'typescript/lib/tsserverlibrary'


export function getSimulateTokenFromNonTemplate(fileName: string, offset: number, program: ts.Program, typescript: typeof ts): {node: ts.Node, token: FlitToken} | null {
	let sourceFile = program.getSourceFile(fileName)
	if (!sourceFile) {
		return null
	}

	let node = getNodeAtOffset(sourceFile, offset)
	if (!node) {
		return null
	}

	// on(..., '|', ...)
	if (typescript.isStringLiteral(node)
		&& typescript.isCallExpression(node.parent)
		&& typescript.isIdentifier(node.parent.expression)
		&& (node.parent.expression.escapedText === 'on' || node.parent.expression.escapedText === 'off')
		&& node.parent.arguments[1] === node
	) {
		let simulateToken: FlitToken = {
			type: FlitTokenType.DomEvent,
			closestCustomTagName: null,
			tagName: '',
			attrPrefix: '',
			attrName: node.getText().replace(/['"]/g, ''),
			attrValue: null,
			nextTokenString: '',
			start: node.getStart() + 1,
			end: node.getEnd() - 1,
			cursorOffset: offset - (node.getStart() + 1),
		}

		return {node, token: simulateToken}
	}

	return null
}