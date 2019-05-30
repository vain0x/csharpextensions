'use strict'
import *  as vscode from 'vscode';

export default class CodeActionProvider implements vscode.CodeActionProvider {
    private _commandIds = {
        ctorFromProperties: 'csharpextensions.ctorFromProperties',
    };

    constructor() {
        vscode.commands.registerCommand(this._commandIds.ctorFromProperties, this.executeCtorFromProperties, this);
    }

    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.Command[] {
        var commands = [];

        var ctorPCommand = this.getCtorpCommand(document, range, context, token);
        if (ctorPCommand)
            commands.push(ctorPCommand);

        return commands;
    }

    private camelize(str) {
        return str.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function (match, index) {
            if (+match === 0) return ""; // or if (/\s+/.test(match)) for white spaces
            return index == 0 ? match.toLowerCase() : match.toUpperCase();
        });
    }

    private executeCtorFromProperties(args: ConstructorFromPropertiesArgument) {
        var tabSize = vscode.workspace.getConfiguration().get('editor.tabSize', 4);
        let ctorParams = [];

        if (!args.properties)
            return;

        args.properties.forEach((p) => {
            ctorParams.push(`${p.type} ${this.camelize(p.name)}`)
        });

        let assignments = [];
        args.properties.forEach((p) => {
            assignments.push(`${Array(tabSize * 1).join(' ')} this.${p.name} = ${this.camelize(p.name)};
            `);
        });

        let firstPropertyLine = args.properties.sort((a, b) => {
            return a.lineNumber - b.lineNumber
        })[0].lineNumber;

        var ctorStatement = `${Array(tabSize * 2).join(' ')} ${args.classDefinition.modifier} ${args.classDefinition.className}(${ctorParams.join(', ')}) 
        {
        ${assignments.join('')}   
        }
        `;

        let edit = new vscode.WorkspaceEdit();
        let edits = [];

        let pos = new vscode.Position(firstPropertyLine, 0);
        let range = new vscode.Range(pos, pos);
        let ctorEdit = new vscode.TextEdit(range, ctorStatement);

        edits.push(ctorEdit)
        edit.set(args.document.uri, edits);

        let reFormatAfterChange = vscode.workspace.getConfiguration().get('csharpextensions.reFormatAfterChange', true);
        let applyPromise = vscode.workspace.applyEdit(edit)

        if (reFormatAfterChange) {
            applyPromise.then(() => {
                vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', args.document.uri).then((formattingEdits: vscode.TextEdit[]) => {
                    var formatEdit = new vscode.WorkspaceEdit();
                    formatEdit.set(args.document.uri, formattingEdits);
                    vscode.workspace.applyEdit(formatEdit);
                });
            })
        }
    }

    private getCtorpCommand(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.Command {
        const editor = vscode.window.activeTextEditor;
        const position = editor.selection.active;

        let withinClass = this.findClassFromLine(document, position.line);
        if (!withinClass)
            return null;

        let properties = [];
        let lineNo = 0;

        while (lineNo < document.lineCount) {
            let readonlyRegex = new RegExp(/(public|private|protected)\s(\w+)\s(\w+)\s?{\s?(get;)\s?(private\s)?(set;)?\s?}/g);
            let textLine = document.lineAt(lineNo);
            let match = readonlyRegex.exec(textLine.text);

            if (match) {
                let clazz = this.findClassFromLine(document, lineNo);
                if (clazz.className === withinClass.className) {
                    let prop: CSharpPropertyDefinition = {
                        lineNumber: lineNo,
                        class: clazz,
                        modifier: match[1],
                        type: match[2],
                        name: match[3],
                        statement: match[0]
                    }

                    properties.push(prop);
                }
            }
            lineNo += 1;
        }

        if (!properties.length)
            return null;

        var classDefinition = this.findClassFromLine(document, position.line);
        if (!classDefinition)
            return;

        var parameter: ConstructorFromPropertiesArgument = {
            properties: properties,
            classDefinition: classDefinition,
            document: document
        };

        let cmd: vscode.Command = {
            title: "Initialize ctor from properties...",
            command: this._commandIds.ctorFromProperties,
            arguments: [parameter]
        };

        return cmd;
    }

    private findClassFromLine(document: vscode.TextDocument, lineNo: number): CSharpClassDefinition {
        var classRegex = new RegExp(/(private|internal|public|protected)\s?(static)?\sclass\s(\w*)/g);
        while (lineNo > 0) {
            var line = document.lineAt(lineNo);
            let match;
            if ((match = classRegex.exec(line.text))) {
                return {
                    startLine: lineNo,
                    endLine: -1,
                    className: match[3],
                    modifier: match[1],
                    statement: match[0]
                };
            }
            lineNo -= 1;
        }
        return null;
    }
}

interface CSharpClassDefinition {
    startLine: number,
    endLine: number,
    className: string,
    modifier: string,
    statement: string
}

interface CSharpPropertyDefinition {
    class: CSharpClassDefinition,
    modifier: string,
    type: string,
    name: string,
    statement: string,
    lineNumber: number
}

interface ConstructorFromPropertiesArgument {
    document: vscode.TextDocument,
    classDefinition: CSharpClassDefinition,
    properties: CSharpPropertyDefinition[]
}
