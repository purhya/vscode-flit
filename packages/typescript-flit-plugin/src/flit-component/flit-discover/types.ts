export interface FlitComponent {

	/** Defined tagName in `define(name, ...)`. */
	name: string | null

	/** Node of it's defined name. */
	nameNode: ts.Node | null

	/** Description is just leading comment. */
	description: string | null

	/** Source file in. */
	sourceFile: ts.SourceFile

	/** Defined declaration in `define(..., declaration)`. */
	declaration: ts.ClassLikeDeclaration

	/** Component public properties, not include properties of super class. */
	properties: Map<string, FlitProperty>

	/** Component events. */
	events: Map<string, FlitEvent>

	/** Direct super class, discovered from `... extends SuperClass`, not been resolved with super class chain. */
	heritages: FlitComponent[]
}


export interface FlitBaseItem {

	/** Defined name in `define(name, ...)`. */
	name: string

	/** Node of it's defined name. */
	nameNode: ts.Node

	/** Description is just leading comment. */
	description: string | null

	/** Source file in. */
	sourceFile: ts.SourceFile
}

export interface FlitBinding extends FlitBaseItem {

	/** Defined declaration in `defineBinding(..., declaration)`. */
	declaration: ts.Declaration
}

export interface FlitProperty extends FlitBaseItem {}

export interface FlitEvent extends FlitBaseItem {}