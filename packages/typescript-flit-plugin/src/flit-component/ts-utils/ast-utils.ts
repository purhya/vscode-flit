import * as ts from 'typescript/lib/tsserverlibrary'


// Reference to https://github.com/runem/web-component-analyzer/blob/master/src/analyze/util/ast-util.ts


/** Get declaration, means find the node where it defined from giver node. */
export function resolveNodeDeclarations(node: ts.Node, typescript: typeof ts, checker: ts.TypeChecker): ts.Declaration[] {
	let symbol = getNodeSymbol(node, typescript, checker)
	if (!symbol) {
		return []
	}

	return resolveSymbolDeclarations(symbol)
}


/** Get the symbol of a given node. */
export function getNodeSymbol(node: ts.Node, typescript: typeof ts, checker: ts.TypeChecker): ts.Symbol | null {
	let symbol = checker.getSymbolAtLocation(node) || null

	if (!symbol) {
		let identifier = getNodeIdentifier(node, typescript)
		symbol = identifier ? checker.getSymbolAtLocation(identifier) || null : null
	}

	// Resolve aliased symbols
	if (symbol && isAliasSymbol(symbol)) {
		symbol = checker.getAliasedSymbol(symbol)
	}

	return symbol
}


/** Returns the ientifier, like variable or declaration name of a given node if possible. */
export function getNodeIdentifier(node: ts.Node, typescript: typeof ts): ts.Identifier | null {
	// Variable.
	if (typescript.isIdentifier(node)) {
		return node
	}

	// Class or interface, property, method, function name.
	if ((typescript.isClassLike(node)
		|| typescript.isInterfaceDeclaration(node)
		|| typescript.isVariableDeclaration(node)
		|| typescript.isMethodDeclaration(node)
		|| typescript.isPropertyDeclaration(node)
		|| typescript.isFunctionDeclaration(node)
		)
		&& node.name
		&& typescript.isIdentifier(node.name)
	) {
		return node.name
	}

	return null
}


/** Returns whether the symbol has `alias` flag. */
function isAliasSymbol(symbol: ts.Symbol): boolean {
	return hasFlag(symbol.flags, ts.SymbolFlags.Alias)
}


/** Returns if a number includes a flag.  */
export function hasFlag(num: number, flag: number): boolean {
	return (num & flag) !== 0
}


/** Resolves the declarations of a symbol. A valueDeclaration is always the first entry in the array. */
function resolveSymbolDeclarations(symbol: ts.Symbol): ts.Declaration[] {
	// Filters all declarations
	let valueDeclaration = symbol.valueDeclaration
	let declarations = symbol.getDeclarations() || []

	if (!valueDeclaration) {
		return declarations
	}
	else {
		// Make sure that `valueDeclaration` is always the first entry.
		return [valueDeclaration, ...declarations.filter(decl => decl !== valueDeclaration)]
	}
}


/** Resolve a declaration of given node by trying to find the real value by following assignments. */
export function resolveNodeDeclarationsDeep(node: ts.Node, typescript: typeof ts, checker: ts.TypeChecker): ts.Node[] {
	let declarations: ts.Node[] = []
	let roughDeclarations = resolveNodeDeclarations(node, typescript, checker)

	for (let declaration of roughDeclarations) {
		// `a = b`, resolve `b`.
		if (typescript.isVariableDeclaration(declaration) && declaration.initializer && typescript.isIdentifier(declaration.initializer)) {
			declarations.push(...resolveNodeDeclarationsDeep(declaration.initializer, typescript, checker))
		}

		// Resolve type alias.
		else if (typescript.isTypeAliasDeclaration(declaration) && declaration.type && typescript.isIdentifier(declaration.type)) {
			declarations.push(...resolveNodeDeclarationsDeep(declaration.type, typescript, checker))
		}

		else {
			declarations.push(declaration)
		}
	}

	return declarations
}


/** Returns an array of modifiers on a given node. */
export function getNodeModifiers(node: ts.Node, typescript: typeof ts): ('readonly' | 'static')[] {
	let modifiers: ('readonly' | 'static')[] = []

	if (hasModifierForNode(node, typescript.SyntaxKind.ReadonlyKeyword)) {
		modifiers.push('readonly')
	}

	if (hasModifierForNode(node, typescript.SyntaxKind.StaticKeyword)) {
		modifiers.push('static')
	}

	if (typescript.isGetAccessor(node)) {
		modifiers.push('readonly')
	}

	return modifiers
}


/** Returns if a given node has a specific modifier. */
export function hasModifierForNode(node: ts.Node, modifierKind: ts.SyntaxKind): boolean {
	if (!node.modifiers) {
		return false
	}

	return node.modifiers.some(modifier => modifier.kind === modifierKind)
}


/** Returns the visibility of given node. */
export function getNodeMemberVisibility(
	node: ts.PropertyDeclaration | ts.PropertySignature | ts.SetAccessorDeclaration | ts.Node,
	typescript: typeof ts
): 'public' | 'protected' | 'private' {
	if (hasModifierForNode(node, typescript.SyntaxKind.PrivateKeyword) || ('name' in node && typescript.isIdentifier(node.name) && isNamePrivate(node.name.text))) {
		return 'private'
	}
	else if (hasModifierForNode(node, typescript.SyntaxKind.ProtectedKeyword)) {
		return 'protected'
	}
	else {
		return 'public'
	}
}


/** Returns if a name is private (starts with '_' or '#'). */
function isNamePrivate(name: string): boolean {
	return name.startsWith('_') || name.startsWith('#')
}


/** Returns whether property is required, which means if doesn't have a undefined union type, or defined as `?:`. */
export function isPropertyRequired(property: ts.PropertySignature | ts.PropertyDeclaration, typescript: typeof ts, checker: ts.TypeChecker): boolean {
	let type = checker.getTypeAtLocation(property)

	// Properties in external modules don't have initializers, so we cannot infer if the property is required or not.
	if (isNodeInDeclarationFile(property)) {
		return false
	}

	// The property will never be not required if it has an initializer.
	if (property.initializer) {
		return false
	}

	// `property?: string`.
	if (property.questionToken) {
		return false
	}

	// 'any' or 'unknown' should not be required.
	if (type.flags === typescript.TypeFlags.Any || type.flags === typescript.TypeFlags.Unknown) {
		return false
	}

	// `undefined` or `null` is not required.
	if (type.flags === typescript.TypeFlags.Undefined || type.flags === typescript.TypeFlags.Null) {
		return false
	}

	// Not required if the property doesn't have an initializer and no type node.
	if (property.type == null) {
		return false
	}

	return true
}


/** Returns whether given node is in a declaration file. */
function isNodeInDeclarationFile(node: ts.Node): boolean {
	return node.getSourceFile().isDeclarationFile
}


/** Find a node recursively walking down the children of the tree. */
export function walkNodeDescent(node: ts.Node, callback: (node: ts.Node) => void): void {
	callback(node)

	node.forEachChild(child => {
		walkNodeDescent(child, callback)
	})
}


/** Find a node recursively walking down the children of the tree. */
export function findNodeDescent<T extends ts.Node = ts.Node>(node: ts.Node, test: (node: ts.Node) => node is T): T | null {
	if (test(node)) {
		return node
	}

	return node.forEachChild(child => {
		return findNodeDescent(child, test) || undefined
	}) || null
}


/**
 * Filter from multiple children by walking down the children of the tree.
 * Note that will also search children if parent match.
 */
export function filterNodeDescent<T extends ts.Node = ts.Node>(node: ts.Node, test: (node: ts.Node) => node is T): T[] {
	let matches: T[] = []

	if (test(node)) {
		matches.push(node)
	}

	node.forEachChild(child => {
		matches.push(...filterNodeDescent(child, test))
	})

	return matches
}


/** 
 * Find multiple children by walking down the children of the tree.
 * Note that will skip children if parent match.
 */
export function matchNodeDescent<T>(node: ts.Node, match: (node: ts.Node) => T | null): T[] {
	let results: T[] = []
	let result = match(node)

	if (result) {
		results.push(result)
	}
	else {
		node.forEachChild(child => {
			results.push(...matchNodeDescent(child, match))
		})
	}

	return results
}


/** Returns the leading comment for given node, includes `/*` or `//`. */
function getNodeLeadingComment(node: ts.Node): string | null {
	let sourceFileText = node.getSourceFile().text
	let leadingComments = ts.getLeadingCommentRanges(sourceFileText, node.pos)

	if (leadingComments && leadingComments.length > 0) {
		return sourceFileText.substring(leadingComments[0].pos, leadingComments[0].end)
	}

	return null
}


/** Returns the description of given node, not includes `/*` or `//`. */
export function getNodeDescription(node: ts.Node): string | null {
	let comment = getNodeLeadingComment(node)
	if (comment) {
		return comment.replace(/^\s*\/\/ ?|^\/\*\*\s*|\s*\*\/$|^\s*\* ?|/gm, '')
	}
	else {
		return null
	}
}


/** Returns the declaration name of a given node if possible. */
export function getNodeName(node: ts.Node, typescript: typeof ts): string | null {
	return getNodeIdentifier(node, typescript)?.getText() || null
}


/** Get node tree text for debugging. */
export function getNodeTreeText(node: ts.Node, typescript: typeof ts) {
	let text = ''

	let walk = (node: ts.Node, tabCount: number) => {
		print(node, tabCount)

		node.forEachChild(child => {
			walk(child, tabCount + 1)
		})
	}

	let print = (node: ts.Node, tabCount: number) => {
		let name = getNodeName(node, typescript)

		text += '\n' + '\t'.repeat(tabCount)
			+ `kind: ${typescript.SyntaxKind[node.kind]}; `
			+ (name ? `name: ${getNodeName(node, typescript)}; ` : '')
			+ `text: ${node.getText().slice(0, 40).replace(/[\r\n]/g, ' ')}; `
	}

	walk(node, 0)

	return text
}


/** Split `A & B & C` to `[A, B, C]` */
export function splitIntersectionTypes(type: ts.TypeNode, typescript: typeof ts): ts.TypeNode[] {
	let splitedTypes: ts.TypeNode[] = []

	if (typescript.isIntersectionTypeNode(type)) {
		for (let chindType of type.types) {
			splitedTypes.push(...splitIntersectionTypes(chindType, typescript))
		}
	}
	else {
		splitedTypes.push(type)
	}

	return splitedTypes
}

