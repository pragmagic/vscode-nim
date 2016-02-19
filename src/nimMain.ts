/*---------------------------------------------------------
 * Copyright (C) Xored Software Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');

import { closeAllNimSuggestProcesses, closeNimSuggestProcess } from './nimSuggestExec';
import { NimCompletionItemProvider } from './nimSuggest';
import { NimDefinitionProvider } from './nimDeclaration';
import { NimReferenceProvider } from './nimReferences';
import { NimDocumentSymbolProvider, NimWorkspaceSymbolProvider } from './nimOutline';
import { NimSignatureHelpProvider } from './nimSignature';
import { check, buildAndRun, ICheckResult } from './nimBuild';
import { offerToInstallTools } from './nimInstallTools'
import { NIM_MODE } from './nimMode'
import { showHideStatus } from './nimStatus'

let diagnosticCollection: vscode.DiagnosticCollection;
var fileWatcher: vscode.FileSystemWatcher;

export function activate(ctx: vscode.ExtensionContext): void {
    ctx.subscriptions.push(vscode.languages.registerCompletionItemProvider(NIM_MODE, new NimCompletionItemProvider(), '.'));
    ctx.subscriptions.push(vscode.languages.registerDefinitionProvider(NIM_MODE, new NimDefinitionProvider()));
    ctx.subscriptions.push(vscode.languages.registerReferenceProvider(NIM_MODE, new NimReferenceProvider()));
    ctx.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(NIM_MODE, new NimDocumentSymbolProvider()));
    ctx.subscriptions.push(vscode.languages.registerSignatureHelpProvider(NIM_MODE, new NimSignatureHelpProvider(), '(', ','));

    diagnosticCollection = vscode.languages.createDiagnosticCollection('nim');
    ctx.subscriptions.push(diagnosticCollection);

    vscode.window.onDidChangeActiveTextEditor(showHideStatus, null, ctx.subscriptions);
    vscode.workspace.onDidCloseTextDocument(closeDocumentHandler);

    let workspaceSymbolProvider = new NimWorkspaceSymbolProvider();
    fileWatcher = vscode.workspace.createFileSystemWatcher("**/*.nim");

    fileWatcher.onDidCreate((uri) => {
        let config = vscode.workspace.getConfiguration('nim');
        if (config.has('licenseString')) {
            let path = uri.fsPath.toLowerCase();
            if (path.endsWith('.nim') || path.endsWith('.nims')) {
                var edit = new vscode.WorkspaceEdit();
                edit.insert(uri, new vscode.Position(0, 0), config['licenseString']);
                vscode.workspace.applyEdit(edit);
            }
        }
        workspaceSymbolProvider.fileChanged(uri);
    });

    fileWatcher.onDidChange((uri) => {
        workspaceSymbolProvider.fileChanged(uri);
    });

    fileWatcher.onDidDelete((uri) => {
        workspaceSymbolProvider.fileDeleted(uri);
    });
    ctx.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider(workspaceSymbolProvider));

    offerToInstallTools();
    startBuildOnSaveWatcher(ctx.subscriptions);

    ctx.subscriptions.push(vscode.commands.registerCommand('nim.run', () => {
        let config = vscode.workspace.getConfiguration('nim');
        buildAndRun(config['project'] || vscode.window.activeTextEditor.document.fileName);
    }));

    if (vscode.window.activeTextEditor) {
        let nimConfig = vscode.workspace.getConfiguration('nim');
        runBuilds(vscode.window.activeTextEditor.document, nimConfig);
    }
}

function deactivate() {
    closeAllNimSuggestProcesses();
    fileWatcher.dispose();
}

function runBuilds(document: vscode.TextDocument, nimConfig: vscode.WorkspaceConfiguration) {

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
    check(uri.fsPath, nimConfig).then(errors => {
        diagnosticCollection.clear();

        let diagnosticMap: Map<vscode.Uri, vscode.Diagnostic[]> = new Map();

        errors.forEach(error => {
            let targetUri = vscode.Uri.file(error.file);
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
            diagnostics.push(diagnostic);
            diagnosticMap.set(targetUri, diagnostics);
        });
        let entries: [vscode.Uri, vscode.Diagnostic[]][] = [];
        diagnosticMap.forEach((diags, uri) => {
            entries.push([uri, diags]);
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
        let nimConfig = vscode.workspace.getConfiguration('nim');
        runBuilds(document, nimConfig);
    }, null, subscriptions);
}

function closeDocumentHandler(document: vscode.TextDocument): void {
    let config = vscode.workspace.getConfiguration('nim');
    if (!config['project']) {
        closeNimSuggestProcess(document.fileName);
    }
}