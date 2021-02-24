interface FlitBaseItem {

	/** Defined name in `define(name, ...)`, or property name event name. */
	readonly name: string

	/** Node of it's defined name. */
	readonly nameNode: ts.Node

	/** Description is just leading comment. */
	readonly description: string | null

	/** Type of item. */
	readonly type: ts.Type

	/** Source file in. */
	readonly sourceFile: ts.SourceFile
}

interface FlitProperty extends FlitBaseItem {

	/** Whether property is public. */
	public: boolean
}

interface FlitEvent extends FlitBaseItem {}

interface FlitDefined extends Omit<FlitBaseItem, 'nameNode'> {

	/** Node of it's defined name. */
	readonly nameNode: ts.Node | null

	/** Defined declaration in `defineBinding(..., declaration)`. */
	readonly declaration: ts.ClassLikeDeclaration
}

interface FlitBinding extends FlitDefined {}

interface FlitComponent extends FlitDefined {

	/** Component public properties, not include properties of super class. */
	readonly properties: Map<string, FlitProperty>

	/** Component events. */
	readonly events: Map<string, FlitEvent>

	/** Component refs. */
	readonly refs: Map<string, FlitProperty>

	/** Component slots. */
	readonly slots: Map<string, FlitProperty>

	/** Direct super class, discovered from `... extends SuperClass`, not been resolved with super class chain. */
	extendedClasses: FlitComponent[]
}
