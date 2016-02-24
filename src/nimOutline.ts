/*---------------------------------------------------------
 * Copyright (C) Xored Software Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import Datastore = require('nedb');
import path = require('path');
import fs = require('fs');

import { getDirtyFile } from './nimUtils'
import { execNimSuggest, INimSuggestResult, NimSuggestType } from './nimSuggestExec'

export class NimWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
    private workspaceSymbols: { [file: string]: vscode.SymbolInformation[]; } = {};
    private db: Datastore;

    public constructor(extensionPath: string) {
        this.db = new Datastore({ filename: path.join(extensionPath, 'types.db'), autoload: true });
        this.db.persistence.setAutocompactionInterval(600000); // compact each 10 munites
        this.db.ensureIndex({ fieldName: 'workspace' });
        this.db.ensureIndex({ fieldName: 'file' });
        this.db.ensureIndex({ fieldName: 'timestamp' });
        this.db.ensureIndex({ fieldName: 'type' });

        vscode.workspace.findFiles("**/*.nim", "").then(urls => {
            let db = this.db;
            let iterate = (uri: vscode.Uri): void => {
                let file = uri.fsPath;
                let timestamp = fs.statSync(file).ctime.getTime();
                db.findOne({ file: file, timestamp: timestamp }, function(err, doc) {
                    if (!doc) {
                        console.log("index: " + file);
                        getFileSymbols(file, null, () => {
                            if (urls.length > 0) {
                                iterate(urls.pop());
                            }
                        }).then(infos => {
                            db.remove({ file: file }, { multi: true }, (err, n) => {
                                infos.forEach((value) => {
                                    db.insert({
                                        workspace: vscode.workspace.rootPath,
                                        file: value.location.uri.fsPath,
                                        range_start: value.location.range.start,
                                        range_end: value.location.range.end,
                                        type: value.name,
                                        container: value.containerName,
                                        kind: value.kind,
                                        timestamp: timestamp
                                    });
                                });
                            });
                        });
                    } else {
                        if (urls.length > 0) {
                            iterate(urls.pop());
                        }
                    }
                });
            };
            if (urls.length > 0) {
                iterate(urls.pop());
            }
        });
    }

    public provideWorkspaceSymbols(query: string, token: vscode.CancellationToken): Thenable<vscode.SymbolInformation[]> {
        return new Promise<vscode.SymbolInformation[]>((resolve, reject) => {
            try {
                let reg = new RegExp(query, 'i');
                this.db.find({ workspace : vscode.workspace.rootPath, type: reg }, (err, docs) => {
                    let symbols = [];
                    docs.forEach(doc => {
                        symbols.push(
                            new vscode.SymbolInformation(
                                doc.type, doc.kind, 
                                new vscode.Range(new vscode.Position(doc.range_start._line, doc.range_start._character), 
                                                new vscode.Position(doc.range_end._line, doc.range_end._character)), 
                                vscode.Uri.file(doc.file), doc.container));
                    });
                    resolve(symbols);
                });
            } catch (e) {
                resolve([]);
            }
        });
    }

    public fileDeleted(uri: vscode.Uri): void {
        this.db.remove({ file: uri.fsPath }, { multi: true });
    }

    public fileChanged(uri: vscode.Uri): void {
        let db = this.db;
        let file = uri.fsPath;
        db.remove({ file: file }, { multi: true }, (err, n) => {
            getFileSymbols(file).then(infos => {
                let timestamp = fs.statSync(file).ctime.getTime();
                infos.forEach((value) => {
                    db.insert({
                        workspace: vscode.workspace.rootPath,
                        file: value.location.uri.fsPath,
                        range_start: value.location.range.start,
                        range_end: value.location.range.end,
                        type: value.name,
                        container: value.containerName,
                        kind: value.kind,
                        timestamp: timestamp
                    });
                });
            });
        });
    }
}

export class NimDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    public provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): Thenable<vscode.SymbolInformation[]> {
        return getFileSymbols(document.fileName, getDirtyFile(document));
    }
}

function getFileSymbols(file: string, dirtyFile?: string, onClose?: () => void): Promise<vscode.SymbolInformation[]> {
    return new Promise<vscode.SymbolInformation[]>((resolve, reject) => {
        execNimSuggest(NimSuggestType.outline, file, 0, 0, dirtyFile, onClose)
            .then(result => {
                var symbols = [];
                result.forEach(item => {
                    let idx = item.name.lastIndexOf('.');
                    let containerName = idx > 0 ? item.name.substr(0, idx) : "";
                    let symbolName = idx > 0 ? item.name.substr(idx + 1) : item.name;

                    let symbolInfo = new vscode.SymbolInformation(
                        symbolName,
                        vscodeKindFromNimSym(item.suggest),
                        new vscode.Range(item.line - 1, item.column, item.line - 1, item.column),
                        vscode.Uri.file(item.path),
                        containerName
                    );

                    symbols.push(symbolInfo);
                });

                resolve(symbols);
            })
            .catch(reason => reject(reason));
    });
}

function vscodeKindFromNimSym(kind: string): vscode.SymbolKind {
    switch (kind) {
        case "skConst":
            return vscode.SymbolKind.Constant;
        case "skEnumField":
            return vscode.SymbolKind.Enum;
        case "skForVar":
            return vscode.SymbolKind.Variable;
        case "skIterator":
            return vscode.SymbolKind.Array;
        case "skLabel":
            return vscode.SymbolKind.String;
        case "skLet":
            return vscode.SymbolKind.Variable;
        case "skMacro":
            return vscode.SymbolKind.Function;
        case "skMethod":
            return vscode.SymbolKind.Method;
        case "skParam":
            return vscode.SymbolKind.Variable;
        case "skProc":
            return vscode.SymbolKind.Function;
        case "skResult":
            return vscode.SymbolKind.Function;
        case "skTemplate":
            return vscode.SymbolKind.Interface;
        case "skType":
            return vscode.SymbolKind.Class;
        case "skVar":
            return vscode.SymbolKind.Variable;
    }
    return vscode.SymbolKind.Property;
}
