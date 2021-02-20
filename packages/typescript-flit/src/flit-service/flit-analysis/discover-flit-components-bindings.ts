import * as ts from 'typescript/lib/tsserverlibrary'
import {resolveNodeValue} from '../../ts-utils/resolve-node-value'
import {ClassOrInterfaceUsage, getNodeDescription, iterateExtendedClasses, iterateExtendedOrImplementedInterfaces, matchNodeDescentUnNesting, resolveNodeDeclarations} from '../../ts-utils/ast-utils'


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

	let declaration: ts.ClassLikeDeclaration
	if (typescript.isClassLike(componentNode)) {
		declaration = componentNode
	}
	else {
		let declarations = resolveNodeDeclarations(componentNode, typescript, checker)

		// Here ignores interface declarations, so it only includes custom codes.
		declaration = declarations.find(declaration => typescript.isClassLike(declaration)) as ts.ClassLikeDeclaration
	}

	if (!declaration) {
		return null
	}

	return {
		name: tagName.value,
		nameNode: tagName.node,
		declaration,
		type: checker.getTypeAtLocation(declaration),
		description: getNodeDescription(declaration, typescript),
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
		if (superClass.declaration.name?.getText() === 'Component') {
			beAComponent = true
		}
	}

	if (!beAComponent) {
		return null
	}

	return getFlitDefinedFromComponentDeclaration(node, typescript, checker)
}


/** Make FlitDefined from class declaration. */
export function getFlitDefinedFromComponentDeclaration(node: ts.ClassLikeDeclaration, typescript: typeof ts, checker: ts.TypeChecker): FlitDefined | null {
	let description = getNodeDescription(node, typescript)
	let name: string = ''

	if (description) {
		let match = description.match(/`<([\w-]+)/)?.[1]
		if (match && match.includes('-')) {
			name = match
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
	
	let bindingInterface: ClassOrInterfaceUsage<ts.InterfaceDeclaration> | undefined
	
	for (let superInterface of iterateExtendedOrImplementedInterfaces(node, typescript, checker)) {
		if (superInterface.declaration.name?.getText() === 'Binding') {
			bindingInterface = superInterface
		}
	}

	if (!bindingInterface) {
		return null
	}

	let description = getNodeDescription(node, typescript)
	let name = ''

	if (description) {
		let match = description.match(/`:(\w+)/)?.[1]
		if (match) {
			name = match
		}
	}

	if (!name) {
		return null
	}

	let type = bindingInterface.typeArguments && bindingInterface.typeArguments.length > 0
		? checker.getTypeAtLocation(bindingInterface.typeArguments[0])
		: (checker as any).getAnyType()	// Private checker API.
	
	return {
		name,
		nameNode: null,
		declaration: node,
		type: type!,
		description,
		sourceFile: node.getSourceFile(),
	}
}