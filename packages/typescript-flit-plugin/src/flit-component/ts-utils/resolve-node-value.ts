import * as ts from 'typescript/lib/tsserverlibrary'
import {resolveNodeDeclarations} from "./ast-utils"


// Reference to https://github.com/runem/web-component-analyzer/blob/master/src/analyze/util/resolve-node-value.ts


export interface NodeValue {

	/** Definition node. */
	node: ts.Node

	/** Definition value. */
	value: any
}


/** When using as a identifier, we want to know the true definition node and it's true value from where it defined. */
export function resolveNodeValue(node: ts.Node, typescript: typeof ts, checker: ts.TypeChecker): NodeValue | null {
	return resolveNodeValueIteratively(node, typescript, checker, 0)
}


export function resolveNodeValueIteratively(node: ts.Node, typescript: typeof ts, checker: ts.TypeChecker, depth: number): NodeValue | null {
	// Avoid infinite resolving.
	if (depth++ >= 10) {
		return null
	}

	// "..."
	if (typescript.isStringLiteralLike(node)) {
		return {value: node.text, node}
	}

	// 123
	else if (typescript.isNumericLiteral(node)) {
		return {value: Number(node.text), node}
	}
	
	// +a, -a, !a
	else if (typescript.isPrefixUnaryExpression(node)) {
		let value = resolveNodeValueIteratively(node.operand, typescript, checker, depth)?.value
		if (value !== null) {
			value = applyPrefixUnaryOperatorToValue(value, node.operator, typescript)
		}

		return {value, node}
	}

	// {...}
	else if (typescript.isObjectLiteralExpression(node)) {
		let object: Record<string, unknown> = {}

		for (let prop of node.properties) {
			if (typescript.isPropertyAssignment(prop)) {
				// Resolve key.
				let resolvedName = resolveNodeValueIteratively(prop.name, typescript, checker, depth)?.value || prop.name.getText()

				// Resolve value.
				let resolvedValue = resolveNodeValueIteratively(prop.initializer, typescript, checker, depth)
				if (resolvedValue && typeof resolvedName === "string") {
					object[resolvedName] = resolvedValue.value
				}
			}
		}

		return {
			value: object,
			node,
		}
	}

	// true
	else if (node.kind === typescript.SyntaxKind.TrueKeyword) {
		return {value: true, node}
	}
	
	// false
	else if (node.kind === typescript.SyntaxKind.FalseKeyword) {
		return {value: false, node}
	}
	
	// null
	else if (node.kind === typescript.SyntaxKind.NullKeyword) {
		return {value: null, node}
	}
	
	// undefined
	else if (node.kind === typescript.SyntaxKind.UndefinedKeyword) {
		return {value: undefined, node}
	}

	// Variable with initializer.
	if (typescript.isVariableDeclaration(node)) {
		if (node.initializer) {
			return resolveNodeValueIteratively(node.initializer, typescript, checker, depth)
		}
		else {
			return null
		}
	}

	// obj.property
	else if (typescript.isPropertyAccessExpression(node)) {
		return resolveNodeValueIteratively(node.name, typescript, checker, depth)
	}

	// key expression part of {[expression]: value}.
	else if (typescript.isComputedPropertyName(node)) {
		return resolveNodeValueIteratively(node.expression, typescript, checker, depth)
	}

	// Resolve initializer value of enum members.
	else if (typescript.isEnumMember(node)) {
		if (node.initializer) {
			return resolveNodeValueIteratively(node.initializer, typescript, checker, depth)
		}
		else {
			return {value: `${node.parent.name.text}.${node.name.getText()}`, node}
		}
	}

	// Be a variable.
	else if (typescript.isIdentifier(node) && checker) {
		let declarations = resolveNodeDeclarations(node, typescript, checker)
		if (declarations.length > 0) {
			let resolved = resolveNodeValueIteratively(declarations[0], typescript, checker, depth)
			if (resolved) {
				return resolved
			}
		}

		return {value: node.getText(), node}
	}

	// value as string
	// <type>value
	// (value)
	else if (typescript.isAsExpression(node) || typescript.isTypeAssertion(node) || typescript.isParenthesizedExpression(node)) {
		return resolveNodeValueIteratively(node.expression, typescript, checker, depth)
	}

	// static get is() {
	//    return "my-element"
	// }
	else if ((typescript.isGetAccessor(node) || typescript.isMethodDeclaration(node) || typescript.isFunctionDeclaration(node)) && node.body) {
		for (let stamement of node.body.statements) {
			if (typescript.isReturnStatement(stamement) && stamement.expression) {
				return resolveNodeValueIteratively(stamement.expression, typescript, checker, depth)
			}
		}
	}

	// [1, 2]
	else if (typescript.isArrayLiteralExpression(node)) {
		return {
			node,
			value: node.elements.map(el => resolveNodeValueIteratively(el, typescript, checker, depth)?.value)
		}
	}

	return null
}


/** Apply +, -, ! operator to value. */
function applyPrefixUnaryOperatorToValue(value: any, operator: ts.SyntaxKind, typescript: typeof ts): any {
	if (typeof value === "object" && value != null) {
		return value
	}

	switch (operator) {
		case typescript.SyntaxKind.MinusToken:
			return -value

		case typescript.SyntaxKind.ExclamationToken:
			return !value

		case typescript.SyntaxKind.PlusToken:
			return +value
	}

	return value
}
