import {FlitToken, FlitTokenType} from "./flit-toker-scanner"
import * as ts from 'typescript/lib/tsserverlibrary'


export function splitPropertyAndModifiers(tokenValue: string) {
	let [property, ...modifiers] = tokenValue.split('.')
	return [property, modifiers] as [string, string[]]
}


export function getScriptElementKindFromToken(token: FlitToken, typescript: typeof ts): ts.ScriptElementKind {
	// For ref with specified name.
	if (token.attrValue !== null) {
		return typescript.ScriptElementKind.memberVariableElement
	}

	switch (token.type) {
		case FlitTokenType.StartTagOpen:
		case FlitTokenType.StartTag:
		case FlitTokenType.Binding:
			if (token.attrValue === null) {
				return typescript.ScriptElementKind.classElement
			}
			else {
				return typescript.ScriptElementKind.memberVariableElement
			}

		case FlitTokenType.Property:
			if (token.attrValue === null) {
				return typescript.ScriptElementKind.memberVariableElement
			}
			else {
				return typescript.ScriptElementKind.string
			}

		case FlitTokenType.BooleanAttribute:
			return typescript.ScriptElementKind.memberVariableElement

		case FlitTokenType.ComEvent:
		case FlitTokenType.DomEvent:
			return typescript.ScriptElementKind.functionElement

		default:
			return typescript.ScriptElementKind.unknown
	}
}


export function getSymbolDisplayPartKindFromToken(token: FlitToken, typescript: typeof ts): ts.SymbolDisplayPartKind {
	switch (token.type) {
		case FlitTokenType.StartTagOpen:
		case FlitTokenType.StartTag:
		case FlitTokenType.Binding:
			if (token.attrValue === null) {
				return typescript.SymbolDisplayPartKind.className
			}
			else {
				return typescript.SymbolDisplayPartKind.propertyName
			}

		case FlitTokenType.Property:
			if (token.attrValue === null) {
				return typescript.SymbolDisplayPartKind.propertyName
			}
			else {
				return typescript.SymbolDisplayPartKind.text
			}

		case FlitTokenType.BooleanAttribute:
			return typescript.SymbolDisplayPartKind.propertyName

		case FlitTokenType.ComEvent:
		case FlitTokenType.DomEvent:
			return typescript.SymbolDisplayPartKind.functionName

		default:
			return typescript.SymbolDisplayPartKind.text
	}
}

