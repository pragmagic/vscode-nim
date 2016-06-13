/*---------------------------------------------------------
 * Copyright (C) Xored Software Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import fs = require('fs');

import { closeAllNimSuggestProcesses, closeNimSuggestProcess } from './nimSuggestExec';
import { NimCompletionItemProvider } from './nimSuggest';
import { NimDefinitionProvider } from './nimDeclaration';
import { NimReferenceProvider } from './nimReferences';
import { NimHoverProvider } from './nimHover';
import { NimDocumentSymbolProvider, NimWorkspaceSymbolProvider } from './nimOutline';
import * as indexer from './nimIndexer';
import { NimSignatureHelpProvider } from './nimSignature';
import { check, ICheckResult } from './nimBuild';
import { NIM_MODE } from './nimMode'
import { showHideStatus } from './nimStatus'
import { initNimSuggest } from './nimUtils'

let diagnosticCollection: vscode.DiagnosticCollection;
var fileWatcher: vscode.FileSystemWatcher;
 
export function activate(ctx: vscode.ExtensionContext): void {
    initNimSuggest(ctx);
    ctx.subscriptions.push(vscode.languages.registerCompletionItemProvider(NIM_MODE, new NimCompletionItemProvider(), '.', ' '));
    ctx.subscriptions.push(vscode.languages.registerDefinitionProvider(NIM_MODE, new NimDefinitionProvider()));
    ctx.subscriptions.push(vscode.languages.registerReferenceProvider(NIM_MODE, new NimReferenceProvider()));
    ctx.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(NIM_MODE, new NimDocumentSymbolProvider()));
    ctx.subscriptions.push(vscode.languages.registerSignatureHelpProvider(NIM_MODE, new NimSignatureHelpProvider(), '(', ','));
    ctx.subscriptions.push(vscode.languages.registerHoverProvider(NIM_MODE, new NimHoverProvider()));
    diagnosticCollection = vscode.languages.createDiagnosticCollection('nim');
    ctx.subscriptions.push(diagnosticCollection);

    vscode.window.onDidChangeActiveTextEditor(showHideStatus, null, ctx.subscriptions);

    console.log(ctx.extensionPath);
    indexer.initWorkspace(ctx.extensionPath);
    fileWatcher = vscode.workspace.createFileSystemWatcher("**/*.nim");
    fileWatcher.onDidCreate((uri) => {
        let config = vscode.workspace.getConfiguration('nim');
        if (config.has('licenseString')) {
            let path = uri.fsPath.toLowerCase();
            if (path.endsWith('.nim') || path.endsWith('.nims')) {
                fs.stat(uri.fsPath, (err, stats) => {
                    if (stats && stats.size === 0) {
                        var edit = new vscode.WorkspaceEdit();
                        edit.insert(uri, new vscode.Position(0, 0), config['licenseString']);
                        vscode.workspace.applyEdit(edit);
                    }
                });
            }
        }
       indexer.addWorkspaceFile(uri.fsPath);
    });

    fileWatcher.onDidChange(uri => indexer.changeWorkspaceFile(uri.fsPath));
    fileWatcher.onDidDelete(uri => indexer.removeWorkspaceFile(uri.fsPath));
    
    ctx.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider(new NimWorkspaceSymbolProvider()));

    startBuildOnSaveWatcher(ctx.subscriptions);

    ctx.subscriptions.push(vscode.commands.registerCommand('nim.build', () => {
        runBuilds(vscode.window.activeTextEditor.document, true);
    }));

    if (vscode.window.activeTextEditor) {
        runBuilds(vscode.window.activeTextEditor.document);
    }
}

function deactivate() {
    closeAllNimSuggestProcesses();
    fileWatcher.dispose();
}

function runBuilds(document: vscode.TextDocument, forceBuild?: boolean) {
    let config = vscode.workspace.getConfiguration('nim');

    function mapSeverityToVSCodeSeverity(sev: string) {
        switch (sev) {
            case "Hint": return vscode.DiagnosticSeverity.Warning;
            case "Error": return vscode.DiagnosticSeverity.Error;
            case "Warning": return vscode.DiagnosticSeverity.Warning;
            default: return vscode.DiagnosticSeverity.Error;
        }
    }

    if (document.languageId != 'nim') {
        return;
    }

    var uri = document.uri;
    check(uri.fsPath, config, forceBuild).then(errors => {
        diagnosticCollection.clear();

        let diagnosticMap: Map<string, vscode.Diagnostic[]> = new Map();
        var err = {};
        errors.forEach(error => {
            if (!err[error.file + error.line + error.column + error.msg]) {
                let targetUri = error.file;
                let endColumn = error.column;
                if (error.msg.indexOf("'") >= 0) {
                    endColumn += error.msg.lastIndexOf("'") - error.msg.indexOf("'") - 2;
                }
                let range = new vscode.Range(error.line - 1, error.column - 1, error.line - 1, endColumn);
                let diagnostic = new vscode.Diagnostic(range, error.msg, mapSeverityToVSCodeSeverity(error.severity));
                let diagnostics = diagnosticMap.get(targetUri);
                if (!diagnostics) {
                    diagnostics = [];
                }
                diagnosticMap.set(targetUri, diagnostics);
                diagnostics.push(diagnostic);
                err[error.file + error.line + error.column + error.msg] = true
            }
        });
        
        let entries: [vscode.Uri, vscode.Diagnostic[]][] = [];
		diagnosticMap.forEach((diags, uri) => {
            entries.push([vscode.Uri.file(uri), diags]);
		});
		diagnosticCollection.set(entries);
    }).catch(err => {
        vscode.window.showInformationMessage("Error: " + err);
    });
}

function startBuildOnSaveWatcher(subscriptions: vscode.Disposable[]) {
    vscode.workspace.onDidSaveTextDocument(document => {
        if (document.languageId != 'nim') {
            return;
        }
        runBuilds(document);
    }, null, subscriptions);
}