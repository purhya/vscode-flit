import * as ts from 'typescript/lib/tsserverlibrary'
import {resolveNodeValue} from '../ts-utils/resolve-node-value'
import {matchNodeDescent, resolveNodeDeclarations} from '../ts-utils/ast-utils'


export interface FlitDefined {

	/** `define` or `defineBinding`. */
	defineKeyWord: string

	/** defining name. */
	name: string

	/** Node of defining name. */
	nameNode: ts.Node

	/** Defined class declaration. */
	declaration: ts.ClassLikeDeclaration
}


/** Walk and Discover all flit components from a given node and it's children. */
export function discoverFlitComponents(sourceFile: ts.SourceFile, typescript: typeof ts, checker: ts.TypeChecker): FlitDefined[] {
	return matchNodeDescent(sourceFile, child => matchFlitDefining(child, 'define', typescript, checker))
}


/** Walk and Discover all flit bindings from a given node and it's children. */
export function discoverFlitBindings(sourceFile: ts.SourceFile, typescript: typeof ts, checker: ts.TypeChecker): FlitDefined[] {
	return matchNodeDescent(sourceFile, child => matchFlitDefining(child, 'defineBinding', typescript, checker))
}


/** Match component definitions:
 * 	   `@define(tagName) ClassDeclaration`
 *     `define(tagName, ClassIdentifier or ClassDeclaration)`
 *     `flit.define(tagName, ClassIdentifier or ClassDeclaration)`
 */
function matchFlitDefining(node: ts.Node, defineKeyWord: string, typescript: typeof ts, checker: ts.TypeChecker): FlitDefined | null {
	if (!typescript.isCallExpression(node)) {
		return null
	}

	// `flit.define(tagName, ClassIdentifier or ClassDeclaration)`
	let beFlitDefine = typescript.isPropertyAccessExpression(node.expression)
		&& node.expression.name!.escapedText === defineKeyWord
		&& node.expression.expression
		&& typescript.isIdentifier(node.expression.expression) && node.expression.expression.text === 'flit'
		&& node.arguments.length === 2

	// `define(tagName, ClassIdentifier or ClassDeclaration)`
	let beDefine = typescript.isIdentifier(node.expression)
		&& node.expression.escapedText === defineKeyWord
		&& node.arguments.length === 2

	// `@define(tagName) class {...})`
	let beDecoratedDefine = typescript.isIdentifier(node.expression)
		&& node.expression.escapedText === defineKeyWord
		&& node.arguments.length === 1
		&& typescript.isDecorator(node.parent)
		&& typescript.isClassDeclaration(node.parent.parent)
	
	if (!beFlitDefine && !beDefine && !beDecoratedDefine) {
		return null
	}

	let unresolvedTagNameNode: ts.Node
	let componentNode: ts.Node

	if (beFlitDefine || beDefine) {
		[unresolvedTagNameNode, componentNode] = node.arguments
	}
	else {
		[unresolvedTagNameNode] = node.arguments
		componentNode = node.parent.parent
	}
	
	let tagName = resolveNodeValue(unresolvedTagNameNode, typescript, checker)
	if (!tagName) {
		return null
	}

	let declarations = resolveNodeDeclarations(componentNode, typescript, checker)

	// Here ignores interface declarations, so it only includes custom codes.
	let declaration = declarations.find(declaration => typescript.isClassDeclaration(declaration)) as ts.ClassLikeDeclaration
	if (!declaration) {
		return null
	}

	return {
		defineKeyWord,
		name: tagName.value,
		nameNode: tagName.node,
		declaration,
	}
}


