import * as ts from 'typescript/lib/tsserverlibrary'
import {resolveNodeValue} from '../../ts-utils/resolve-node-value'
import {getNodeDescription, iterateExtendedClasses, iterateExtendedOrImplementedInterfaces, matchNodeDescentUnNesting, resolveNodeDeclarations} from '../../ts-utils/ast-utils'
import {FlitDefined} from './types'


/** Walk and Discover all flit components from a given node and it's children. */
export function discoverFlitComponents(sourceFile: ts.SourceFile, typescript: typeof ts, checker: ts.TypeChecker): FlitDefined[] {
	if (isDeclarationFile(sourceFile)) {
		return matchNodeDescentUnNesting(sourceFile, child => guessFlitComponent(child, typescript, checker))
	}
	else {
		return matchNodeDescentUnNesting(sourceFile, child => matchFlitDefining(child, 'define', typescript, checker))
	}
}


/** Walk and Discover all flit bindings from a given node and it's children. */
export function discoverFlitBindings(sourceFile: ts.SourceFile, typescript: typeof ts, checker: ts.TypeChecker): FlitDefined[] {
	if (isDeclarationFile(sourceFile)) {
		return matchNodeDescentUnNesting(sourceFile, child => guessFlitBinding(child, typescript, checker))
	}
	else {
		return matchNodeDescentUnNesting(sourceFile, child => matchFlitDefining(child, 'defineBinding', typescript, checker))
	}
}


function isDeclarationFile(sourceFile: ts.SourceFile) {
	return sourceFile.fileName.endsWith('.d.ts')
}


/** Match component or binging definitions from:
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
		name: tagName.value,
		nameNode: tagName.node,
		declaration,
		type: checker.getTypeAtLocation(declaration),
		description: getNodeDescription(declaration),
		sourceFile: declaration.getSourceFile(),
	}
}


/** 
 * Guess component definitions from:
 * 	   `xxx extends Component`
 */
function guessFlitComponent(node: ts.Node, typescript: typeof ts, checker: ts.TypeChecker): FlitDefined | null {
	if (!typescript.isClassDeclaration(node)) {
		return null
	}
	
	let beAComponent = false
	for (let superClass of iterateExtendedClasses(node, typescript, checker)) {
		if (superClass.name?.getText() === 'Component') {
			beAComponent = true
		}
	}

	if (!beAComponent) {
		return null
	}

	return getFlitDefinedFromComponentDeclaration(node, checker)
}


/** Make FlitDefined from class declaration. */
export function getFlitDefinedFromComponentDeclaration(node: ts.ClassLikeDeclaration, checker: ts.TypeChecker): FlitDefined | null {
	let description = getNodeDescription(node)
	let name: string = ''

	if (description) {
		let m = description.match(/`<([\w-]+)/)
		if (m && m[1].includes('-')) {
			name = m[1]
		}
	}

	return {
		name,
		nameNode: null,
		declaration: node,
		type: checker.getTypeAtLocation(node),
		description,
		sourceFile: node.getSourceFile(),
	}
}


/** 
 * Guess binding definitions from:
 * 	   `xxx implements Binding`
 */
function guessFlitBinding(node: ts.Node, typescript: typeof ts, checker: ts.TypeChecker): FlitDefined | null {
	if (!typescript.isClassDeclaration(node)) {
		return null
	}
	
	let beABinding = false
	for (let superClass of iterateExtendedOrImplementedInterfaces(node, typescript, checker)) {
		if (superClass.name?.getText() === 'Binding') {
			beABinding = true
		}
	}

	if (!beABinding) {
		return null
	}

	let description = getNodeDescription(node)
	let name = ''

	if (description) {
		let m = description.match(/`:(\w+)/)
		if (m) {
			name = m[1]
		}
	}

	if (!name) {
		return null
	}
	
	return {
		name,
		nameNode: null,
		declaration: node,
		type: checker.getTypeAtLocation(node),
		description,
		sourceFile: node.getSourceFile(),
	}
}