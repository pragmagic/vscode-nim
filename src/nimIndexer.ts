/*---------------------------------------------------------
 * Copyright (C) Xored Software Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import Datastore = require('nedb');
import path = require('path');
import fs = require('fs');

import { execNimSuggest, INimSuggestResult, NimSuggestType } from './nimSuggestExec'
import { showNimProgress, hideNimProgress, updateNimProgress } from './nimStatus'

let pathCache: { [tool: string]: string; } = {};
let dbVersion: number = 2;

var dbFiles: Datastore;
var dbTypes: Datastore;

/**
 * Returns workspace path from lowercase version of worspace path.
 * It is required for pathes in different cases, 
 * because nim compiler on windows system returns all pathes converted in lowercase.
 * @param file lowercase workspace path
 */
export function getNormalizedWorkspacePath(file: string): string {
    return (process.platform === 'win32' && pathCache[file]) || file;
}

export function addWorkspaceFile(file: string): void {
    pathCache[file.toLowerCase()] = file;
    indexFile(file);
}

export function removeWorkspaceFile(file: string): void {
    pathCache[file.toLowerCase()] = null;
    removeFromIndex(file);
}

export function changeWorkspaceFile(file: string): void {
    indexFile(file);
}

export function initWorkspace(extensionPath: string): void {
    // remove old version of indexes
    cleanOldDb(extensionPath, 'files');
    cleanOldDb(extensionPath, 'types');

    dbTypes = new Datastore({ filename: path.join(extensionPath, getDbName('types', dbVersion)), autoload: true });
    dbTypes.persistence.setAutocompactionInterval(600000); // compact each 10 munites
    dbTypes.ensureIndex({ fieldName: 'workspace' });
    dbTypes.ensureIndex({ fieldName: 'file' });
    dbTypes.ensureIndex({ fieldName: 'timestamp' });
    dbTypes.ensureIndex({ fieldName: 'type' });

    dbFiles = new Datastore({ filename: path.join(extensionPath, getDbName('files', dbVersion)), autoload: true });
    dbFiles.persistence.setAutocompactionInterval(600000); // compact each 10 munites
    dbFiles.ensureIndex({ fieldName: 'file' });
    dbFiles.ensureIndex({ fieldName: 'timestamp' });

    vscode.workspace.findFiles("**/*.nim", "")
        .then(urls => urls.forEach(url => pathCache[url.fsPath.toLowerCase()] = url.fsPath));

    vscode.workspace.findFiles("**/*.nim", "").then(urls => {
        let db = this.db;
        let total = urls.length;
        showNimProgress(`Indexing: ${total}`);
        let iterate = (uri: vscode.Uri): void => {
            let file = uri.fsPath;
            let cnt = total - urls.length;
            if (urls.length <= 10) {
                hideNimProgress();
            } else if (cnt % 10 == 0) {
                updateNimProgress(`Indexing: ${cnt} of ${total}`);
            }

            indexFile(file).then(() => {
                if (urls.length > 0) {
                    iterate(urls.pop());
                }
            });
        };
        if (urls.length > 0) {
            iterate(urls.pop());
        } else {
            hideNimProgress();
        }
    });
}

export function findWorkspaceSymbols(query: string): Promise<vscode.SymbolInformation[]> {
    return new Promise<vscode.SymbolInformation[]>((resolve, reject) => {
        try {
            let reg = new RegExp(query, 'i');
            dbTypes.find({ workspace: vscode.workspace.rootPath, type: reg }, (err, docs) => {
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

export function getFileSymbols(file: string, dirtyFile?: string, onClose?: () => void): Promise<vscode.SymbolInformation[]> {
    return new Promise<vscode.SymbolInformation[]>((resolve, reject) => {
        execNimSuggest(NimSuggestType.outline, file, 0, 0, dirtyFile, onClose)
            .then(result => {
                var symbols = [];
                result.forEach(item => {
                    let idx = item.name.lastIndexOf('.');
                    let containerName = idx > 0 ? item.name.substr(0, idx) : "";
                    let symbolName = idx > 0 ? item.name.substr(idx + 1) : item.name;

                    // skip let and var in proc and methods
                    if ((item.suggest === "skLet" || item.suggest === "skVar") && containerName.indexOf('.') > 0) {
                        return;
                    }

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

function indexFile(file: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        let timestamp = fs.statSync(file).mtime.getTime();
        dbFiles.findOne({ file: file, timestamp: timestamp }, function(err, doc) {
            if (!doc) {
                console.log("index: " + file);
                dbFiles.remove({ file: file }, { multi: true }, (err, n) => {
                    dbFiles.insert({ file: file, timestamp: timestamp });
                });
                getFileSymbols(file, null, resolve).then(infos => {
                    dbTypes.remove({ file: file }, { multi: true }, (err, n) => {
                        infos.forEach((value) => {
                            dbTypes.insert({
                                workspace: vscode.workspace.rootPath,
                                file: getNormalizedWorkspacePath(value.location.uri.fsPath),
                                range_start: value.location.range.start,
                                range_end: value.location.range.end,
                                type: value.name,
                                container: value.containerName,
                                kind: value.kind
                            });
                        });
                    });
                });
            } else {
                resolve();
            }
        });
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

function removeFromIndex(file: string): void {
    dbFiles.remove({ file: file }, { multi: true }, function(err, doc) {
        dbTypes.remove({ file: file }, { multi: true });
    });
}

function cleanOldDb(basePath: string, name: string): void {
    var dbPath = path.join(basePath, `${name}.db`);
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
    }
    for (var i = 0; i < dbVersion; ++i) {
        var dbPath = path.join(basePath, getDbName(name, i));
        if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
        }
    }
}

function getDbName(name: string, version: number): string {
    return `${name}_${version}.db`;
}