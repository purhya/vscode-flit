import {FlitToken, FlitTokenType} from "./flit-toker-scanner"
import * as ts from 'typescript/lib/tsserverlibrary'


export function splitBindingProperty(tokenValue: string) {
	let [bindingName, ...modifiers] = tokenValue.split('.')

	return {
		bindingName,
		modifiers,
	}
}


export function getScriptElementKindFromToken(token: FlitToken, typescript: typeof ts) {
	// For ref with specified name.
	if (token.attrValue !== null) {
		return typescript.ScriptElementKind.memberVariableElement
	}

	switch (token.type) {
		case FlitTokenType.StartTagOpen:
		case FlitTokenType.StartTag:
		case FlitTokenType.Binding:
			return typescript.ScriptElementKind.classElement

		case FlitTokenType.Property:
			return typescript.ScriptElementKind.memberVariableElement

		case FlitTokenType.ComEvent:
		case FlitTokenType.DomEvent:
			return typescript.ScriptElementKind.functionElement
	}
}


export function getSymbolDisplayPartKindFromToken(token: FlitToken, typescript: typeof ts) {
	switch (token.type) {
		case FlitTokenType.StartTagOpen:
		case FlitTokenType.StartTag:
		case FlitTokenType.Binding:
			return typescript.SymbolDisplayPartKind.className

		case FlitTokenType.Property:
			return typescript.SymbolDisplayPartKind.propertyName

		case FlitTokenType.ComEvent:
		case FlitTokenType.DomEvent:
			return typescript.SymbolDisplayPartKind.functionName
	}
}
