import * as ts from 'typescript/lib/tsserverlibrary'
import {discoverFlitBindings, discoverFlitComponents, getFlitDefinedFromComponentDeclaration} from './discover-flit-components-bindings'
import {discoverFlitEvents} from './discover-flit-events'
import {discoverFlitProperties, discoverFlitSubProperties} from './discover-flit-properties'
import {iterateExtendedClasses, resolveExtendedClasses} from '../../ts-utils/ast-utils'
import {mayDebug} from '../../helpers/logger'
import {discoverFlitIcons, FlitIcon} from './discover-flit-icons'


export class FlitAnalyzer {

	/** Last analysised source files. */
	private files: Set<ts.SourceFile> = new Set()

	/** Analysised components. */
	private components: Map<ts.Declaration, FlitComponent> = new Map()

	/** Analysised bindings. */
	private bindings: Map<string, FlitBinding> = new Map()

	/** All imported icons. */
	private icons: Map<string, FlitIcon> = new Map()

	/** Analysised components, but extended class not been analysised because expired or can't been resolved. */
	private extendedClassNotResolvedComponents: Set<FlitComponent> = new Set()

	constructor(
		private readonly typescript: typeof ts,
		private readonly tsLanguageService: ts.LanguageService
	) {}

	get program() {
		return this.tsLanguageService.getProgram()!
	}

	get typeChecker() {
		return this.program.getTypeChecker()
	}

	/** Format type to a readable description. */
	getTypeDescription(type: ts.Type) {
		return this.typeChecker.typeToString(type)
	}

	/** Format type to a readable description. */
	getTypeUnionStringList(type: ts.Type): string[] {
		if (type.isUnion()) {
			return type.types.map(t => this.getTypeUnionStringList(t)).flat()
		}
		else if (type.isStringLiteral()) {
			return [this.getTypeDescription(type).replace(/['"]/g, '')]
		}
		else {
			return []
		}
	}

	/** Update to makesure reloading changed source files. */
	update() {
		let changedFiles = this.getChangedFiles()

		for (let file of changedFiles) {
			this.analysisTSFile(file)
		}

		// If `extends XXX` can't been resolved, keep it in `extendedClassNotResolvedComponents` and check it every time.
		// Otherwise we analysis all components, and then their extended classes.
		if (changedFiles.size > 0) {
			for (let component of [...this.extendedClassNotResolvedComponents]) {
				let superClasses = this.getExtendedClasses(component.declaration)
				if (superClasses.length > 0) {
					component.extendedClasses = superClasses
					this.extendedClassNotResolvedComponents.delete(component)
				}
			}
		}
	}

	/** Get changed or not analysised files but exclude `lib.???.d.ts`. */
	private getChangedFiles() {
		// All files exclude typescript lib files.
		let allFiles = new Set(
			this.program.getSourceFiles()
				.filter(file => !/lib\.(?:[^\\\/]+\.)?d\.ts$/.test(file.fileName))
		)

		let changedFiles: Set<ts.SourceFile> = new Set()
		let expiredFiles: Set<ts.SourceFile> = new Set()

		for (let file of allFiles) {
			if (!this.files.has(file)) {
				changedFiles.add(file)
			}
		}

		for (let file of this.files) {
			if (!allFiles.has(file)) {
				expiredFiles.add(file)
			}
		}

		this.makeFilesExpire(expiredFiles)
		this.files = allFiles

		return changedFiles
	}

	/** Make parsed results in given files expired. */
	private makeFilesExpire(files: Set<ts.SourceFile>) {
		// Defined component expired.
		for (let [declaration, component] of [...this.components.entries()]) {
			if (files.has(component.sourceFile)) {
				this.components.delete(declaration)
				this.extendedClassNotResolvedComponents.delete(component)
			}
		}

		// Extended Classes expired.
		for (let component of this.components.values()) {
			if (component.extendedClasses && component.extendedClasses.some(superClass => files.has(superClass.sourceFile))) {
				component.extendedClasses = []
				this.extendedClassNotResolvedComponents.add(component)
			}
		}

		// Binding expired.
		for (let [bindingName, binding] of [...this.bindings.entries()]) {
			if (files.has(binding.sourceFile)) {
				this.bindings.delete(bindingName)
			}
		}
	}

	/** Analysis each ts file. */
	private analysisTSFile(sourceFile: ts.SourceFile) {
		let components = discoverFlitComponents(sourceFile, this.typescript, this.typeChecker)
		let bindings = discoverFlitBindings(sourceFile, this.typescript, this.typeChecker)
		let icons = discoverFlitIcons(sourceFile, this.typescript)

		// `@define ...` results will always cover others. 
		for (let component of components) {
			this.analysisComponent(component)
		}
	
		for (let binding of bindings) {
			this.bindings.set(binding.name, binding)

			mayDebug(() => ({
				name: binding.name,
				description: binding.description,
			}))
		}

		for (let icon of icons) {
			this.icons.set(icon.name, icon)
		}

		if (icons.length > 0) {
			mayDebug(() => {
				return icons.map(i => ({
					name: i.name,
					description: i.description,
				}))
			})
		}
	}

	/** Analysis one base component result. */
	private analysisComponent(defined: FlitDefined) {
		let declaration = defined.declaration
		let properties: Map<string, FlitProperty> = new Map()
		let events: Map<string, FlitEvent> = new Map()
		let refs: Map<string, FlitProperty> = new Map()
		let slots: Map<string, FlitProperty> = new Map()

		for (let property of discoverFlitProperties(declaration, this.typescript, this.typeChecker)) {
			properties.set(property.name, property)
		}

		for (let event of discoverFlitEvents(declaration, this.typescript, this.typeChecker)) {
			events.set(event.name, event)
		}

		for (let ref of discoverFlitSubProperties(declaration, 'refs', this.typescript, this.typeChecker) || []) {
			refs.set(ref.name, ref)
		}

		for (let slot of discoverFlitSubProperties(declaration, 'slots', this.typescript, this.typeChecker) || []) {
			slots.set(slot.name, slot)
		}
		
		// Heriatages to be analysised later, so we will analysis `@define ...`, and then super class.
		let component = {
			...defined,
			properties,
			events,
			refs,
			slots,
			extendedClasses: [],
		} as FlitComponent

		if (declaration.heritageClauses && declaration.heritageClauses?.length > 0) {
			this.extendedClassNotResolvedComponents.add(component)
		}

		mayDebug(() => ({
			name: component.name,
			superClasses: [...iterateExtendedClasses(component.declaration, this.typescript, this.typeChecker)].map(n => n.declaration.name?.getText()),
			properties: [...component.properties.values()].map(p => p.name),
			events: [...component.events.values()].map(e => e.name),
			refs: [...component.refs.values()].map(e => e.name),
			slots: [...component.slots.values()].map(e => e.name),
		}))
		
		this.components.set(declaration, component)
	}

	/** Analysis extended classes and returns result. */
	private getExtendedClasses(declaration: ts.ClassLikeDeclaration) {
		let extendedClasses: FlitComponent[] = []
		let classesWithType = resolveExtendedClasses(declaration, this.typescript, this.typeChecker)

		if (classesWithType) {
			for (let declaration of classesWithType.map(v => v.declaration)) {
				let superClass = this.getAnalysisedSuperClass(declaration)
				if (superClass) {
					extendedClasses.push(superClass)
				}
			}
		}

		return extendedClasses
	}

	/** Makesure component analysised and returns result. */
	private getAnalysisedSuperClass(declaration: ts.ClassLikeDeclaration): FlitComponent | null {
		if (!this.components.has(declaration)) {
			let defined = getFlitDefinedFromComponentDeclaration(declaration, this.typescript, this.typeChecker)
			if (defined) {
				this.analysisComponent(defined)
			}
		}

		return this.components.get(declaration) || null
	}



	/** Get component by it's tag name. */
	getComponent(name: string): FlitComponent | null {
		let component = [...this.components.values()].find(component => component.name === name)
		return component || null
	}

	/** Get component by it's class declaration. */
	getComponentByDeclaration(declaration: ts.ClassLikeDeclaration): FlitComponent | null {
		return this.components.get(declaration) || null
	}

	/** Get bindings that name matches. */
	getBinding(name: string): FlitBinding | null {
		for (let binding of this.bindings.values()) {
			if (binding.name === name) {
				return binding
			}
		}

		return null
	}

	/** Get properties for component defined with `tagName`, and name matches. */
	getComponentProperty(propertyName: string, tagName: string): FlitProperty | null {
		let component = this.getComponent(tagName)
		if (!component) {
			return null
		}
	
		for (let com of this.walkComponents(component)) {
			for (let property of com.properties.values()) {
				if (property.name === propertyName) {
					return property
				}
			}
		}

		return null
	}

	/** Get events for component defined with `tagName`, and name matches. */
	getComponentEvent(name: string, tagName: string): FlitEvent | null {
		let component = this.getComponent(tagName)
		if (!component) {
			return null
		}

		for (let com of this.walkComponents(component)) {
			for (let event of com.events.values()) {
				if (event.name === name) {
					return event
				}
			}
		}

		return null
	}

	/** Get all refs or slots properties outer class declaration contains given node. */
	getSubProperties(propertyName: 'refs' | 'slots', subPropertyName: string, tagName: string): FlitProperty | null {
		let component = this.getComponent(tagName)
		if (!component) {
			return null
		}

		for (let com of this.walkComponents(component)) {
			for (let property of com[propertyName].values()) {
				if (property.name === subPropertyName) {
					return property
				}
			}
		}

		return null
	}

	/** Get a icon from it's defined file name. */
	getIcon(name: string): FlitIcon | null {
		return this.icons.get(name) || null
	}



	/** Get components that name starts with label. */
	getComponentsForCompletion(label: string): FlitComponent[] {
		let components: FlitComponent[] = []

		for (let component of this.components.values()) {
			if (component.name?.startsWith(label)) {
				components.push(component)
			}
		}

		return components
	}

	/** Get bindings that name starts with label. */
	getBindingsForCompletion(label: string): FlitBinding[] {
		let bindings: FlitBinding[] = []

		for (let binding of this.bindings.values()) {
			if (binding.name.startsWith(label)) {
				bindings.push(binding)
			}
		}

		return bindings
	}

	/** Get properties for component defined with `tagName`, and name starts with label. */
	getComponentPropertiesForCompletion(label: string, tagName: string, mustBePublic = true): FlitProperty[] | null {
		let component = this.getComponent(tagName)
		if (!component) {
			return null
		}
		
		let properties: Map<string, FlitProperty> = new Map()

		for (let com of this.walkComponents(component)) {
			for (let property of com.properties.values()) {
				if (mustBePublic && !property.public) {
					continue
				}
				
				if (property.name.startsWith(label) && !properties.has(property.name)) {
					properties.set(property.name, property)
				}
			}
		}

		return [...properties.values()]
	}

	/** Walk component and it's super classes. */
	private *walkComponents(component: FlitComponent, deep = 0): Generator<FlitComponent> {
		yield component

		for (let superClass of component.extendedClasses) {
			yield *this.walkComponents(superClass, deep + 1)
		}
	}

	/** Get events for component defined with `tagName`, and name starts with label. */
	getComponentEventsForCompletion(label: string, tagName: string): FlitEvent[] | null {
		let component = this.getComponent(tagName)
		if (!component) {
			return null
		}

		let events: Map<string, FlitEvent> = new Map()

		for (let com of this.walkComponents(component)) {
			for (let event of com.events.values()) {
				if (event.name.startsWith(label) && !events.has(event.name)) {
					events.set(event.name, event)
				}
			}
		}

		return [...events.values()]
	}

	/** Get all refs or slots properties outer class declaration contains given node. */
	getSubPropertiesForCompletion(propertyName: 'refs' | 'slots', subPropertyNameLabel: string, tagName: string): FlitProperty[] | null {
		let component = this.getComponent(tagName)
		if (!component) {
			return null
		}

		let properties: Map<string, FlitProperty> = new Map()

		for (let com of this.walkComponents(component)) {
			for (let property of com[propertyName].values()) {
				if (property.name.startsWith(subPropertyNameLabel) && !properties.has(property.name)) {
					properties.set(property.name, property)
				}
			}
		}

		return [...properties.values()]
	}

	/** Get a icon when it's defined file name matches label. */
	getIconsForCompletion(label: string): FlitIcon[] {
		return [...this.icons.values()].filter(icon => icon.name.startsWith(label))
	}
}