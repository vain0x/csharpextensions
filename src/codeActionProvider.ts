import *  as vscode from 'vscode'

/** Definition of class/struct. */
interface CSharpTypeDef {
    typeName: string,
    startLine: number,
    endLine: number,
}

/** Definitinon of property or field. */
interface CSharpPropDef {
    typeDef: CSharpTypeDef,
    type: string,
    name: string,
    line: number,
}

/** Information for 'generate constructor' command. */
interface GenCtorArgs {
    doc: vscode.TextDocument,
    typeDef: CSharpTypeDef,
    props: CSharpPropDef[],
    position: vscode.Position,
}

/**
 * Convert field/property name to parameter name, i.e. lower camel case.
 */
const toParameterName = (str: string) => {
    // Strip the underscore attached for private fields.
    if (str.startsWith("_")) {
        str = str.slice(1)
    }

    return str.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, (match, index) => {
        if (+match === 0) return ""; // or if (/\s+/.test(match)) for white spaces
        return index == 0 ? match.toLowerCase() : match.toUpperCase()
    })
}

const matchTextLineWithFieldDecl = (text: string, line: number, typeDef: CSharpTypeDef): CSharpPropDef => {
    // <modifier>* <type-name> <field-name> ';'
    const reg = /^\s*(?:(?:public|private|protected|internal|ref|readonly)\s*)*([_\w\d<>., ]+(?<!\s))\s*(\b[\w\d_]+)(?=\s*;)/

    const match = reg.exec(text)

    if (!match) {
        return null
    }

    return {
        typeDef,
        type: match[1],
        name: match[2],
        line,
    }
}

const matchTextLineWithPropDecl = (text: string, line: number, typeDef: CSharpTypeDef): CSharpPropDef => {
    // <modifier>* <type-name> <field-name> !'='
    const reg = /(?:^\s*(?:public|private|protected|internal|ref|readonly)\s*)*([_\w\d<>., ]+(?<!\s))\s*(\b[\w\d_]+)\s*\{.+get.+\}(?!\s*=)/

    const match = reg.exec(text);

    if (!match) {
        return null
    }

    return {
        typeDef,
        type: match[1],
        name: match[2],
        line: line,
    }
}

export default class CodeActionProvider implements vscode.CodeActionProvider {
    private _commandIds = {
        genCtor: 'csharp-gen-ctor.ctorFromProperties',
    }

    constructor() {
        vscode.commands.registerCommand(this._commandIds.genCtor, this.executeGenCtor, this)
    }

    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.Command[] {
        const commands = []

        const genCtorCommand = this.genCtorCommand(document, range, context, token)
        if (genCtorCommand) {
            commands.push(genCtorCommand)
        }

        return commands;
    }

    private executeGenCtor(args: GenCtorArgs) {
        const ctorParams = args.props.map(p => `${p.type} ${toParameterName(p.name)}`)

        let assignments = args.props.map(p => {
            const paramName = toParameterName(p.name)
            const lhs = p.name === paramName ? `this.${p.name}` : p.name
            return `${lhs} = ${paramName};`
        })

        var ctorStatement = `public ${args.typeDef.typeName}(${ctorParams.join(', ')})
        {
            ${assignments.join("\n            ")}
        }`;

        let edit = new vscode.WorkspaceEdit()
        let pos = args.position
        let range = new vscode.Range(pos, pos)
        let ctorEdit = new vscode.TextEdit(range, ctorStatement)
        edit.set(args.doc.uri, [ctorEdit])

        let reFormatAfterChange = vscode.workspace.getConfiguration().get('csharp-gen-ctor.reFormatAfterChange', true)
        let applyPromise = vscode.workspace.applyEdit(edit)

        if (reFormatAfterChange) {
            applyPromise.then(() => {
                vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', args.doc.uri).then((formattingEdits: vscode.TextEdit[]) => {
                    var formatEdit = new vscode.WorkspaceEdit()
                    formatEdit.set(args.doc.uri, formattingEdits)
                    vscode.workspace.applyEdit(formatEdit)
                })
            })
        }
    }

    private genCtorCommand(doc: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.Command {
        const editor = vscode.window.activeTextEditor
        const position = editor.selection.active

        const enclosingTypeDef = this.findTypeDefFromLine(doc, position.line)
        if (!enclosingTypeDef) {
            return null
        }

        const props: CSharpPropDef[] = []
        let line = enclosingTypeDef.startLine + 1

        while (line < enclosingTypeDef.endLine) {
            const textLine = doc.lineAt(line)
            
            const prop = matchTextLineWithPropDecl(textLine.text, line, enclosingTypeDef)
            if (prop !== null) {
                const nearestTypeDef = this.findTypeDefFromLine(doc, line)
                if (nearestTypeDef && nearestTypeDef.typeName === prop.typeDef.typeName) {
                    props.push(prop)
                }
            }

            const field = matchTextLineWithFieldDecl(textLine.text, line, enclosingTypeDef)
            if (field !== null) {
                const nearestTypeDef = this.findTypeDefFromLine(doc, line)
                if (nearestTypeDef && nearestTypeDef.typeName === field.typeDef.typeName) {
                    props.push(field)
                }
            }

            line += 1
        }

        if (props.length === 0) {
            return null
        }

        const args: GenCtorArgs = {
            props,
            typeDef: enclosingTypeDef,
            doc,
            position,
        }

        const cmd: vscode.Command = {
            title: "Generate constructor from properties",
            command: this._commandIds.genCtor,
            arguments: [args]
        }

        return cmd
    }

    private findTypeDefFromLine(doc: vscode.TextDocument, line: number): CSharpTypeDef {
        const typeReg = /^\s*(?:(?:abstract|sealed|static|public|private|protected|internal|ref|readonly)\s*)*(?:class|struct)\s*([\w\d_]+)/
        while (line > 0) {
            const textLine = doc.lineAt(line)
            const match = typeReg.exec(textLine.text)
            if (match) {
                return {
                    startLine: line,
                    endLine: doc.lineCount, // FIXME: find corresponding '}'
                    typeName: match[1],
                }
            }
            line -= 1
        }
        return null
    }
}
