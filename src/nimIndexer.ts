/*---------------------------------------------------------
 * Copyright (C) Xored Software Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import Datastore = require('nedb');
import path = require('path');
import fs = require('fs');

import { getNimSuggestPath, execNimSuggest, NimSuggestResult, NimSuggestType } from './nimSuggestExec';
import { showNimProgress, hideNimProgress, updateNimProgress } from './nimStatus';

let dbVersion: number = 4;

var dbFiles: Datastore;
var dbTypes: Datastore;

/**
 * Returns workspace path from lowercase version of worspace path.
 * It is required for pathes in different cases, 
 * because nim compiler on windows system returns all pathes converted in lowercase.
 * @param file lowercase workspace path
 */
export function addWorkspaceFile(file: string): void {
    indexFile(file);
}

export function removeWorkspaceFile(file: string): void {
    removeFromIndex(file);
}

export function changeWorkspaceFile(file: string): void {
    indexFile(file);
}

export async function initWorkspace(extensionPath: string): Promise<void> {
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

    if (!getNimSuggestPath()) {
        return;
    }

    let urls = await vscode.workspace.findFiles('**/*.nim', '');

    showNimProgress(`Indexing: ${urls.length}`);
    for (var i = 0; i < urls.length; i++) {
        let url = urls[i];
        let file = url.fsPath;
        let cnt = urls.length - i;

        if (cnt % 10 === 0) {
            updateNimProgress(`Indexing: ${cnt} of ${urls.length}`);
        }

        await indexFile(file);
    }
    hideNimProgress();
}

export function findWorkspaceSymbols(query: string): Promise<vscode.SymbolInformation[]> {
    return new Promise<vscode.SymbolInformation[]>((resolve, reject) => {
        try {
            let reg = new RegExp(query, 'i');
            dbTypes.find<any>({ ws: vscode.workspace.rootPath, type: reg }).limit(100).exec((err, docs) => {
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

export function getFileSymbols(file: string, dirtyFile?: string): Promise<vscode.SymbolInformation[]> {
    return new Promise<vscode.SymbolInformation[]>((resolve, reject) => {
        execNimSuggest(NimSuggestType.outline, file, 0, 0, dirtyFile)
            .then(result => {
                var symbols = [];
                var exists = [];
                result.forEach(item => {

                    // skip let and var in proc and methods
                    if ((item.suggest === 'skLet' || item.suggest === 'skVar') && item.containerName.indexOf('.') > 0) {
                        return;
                    }

                    if (exists.indexOf(item.column + ':' + item.line) === -1) {
                        exists.push(item.column + ':' + item.line);
                        let symbolInfo = new vscode.SymbolInformation(
                            item.symbolName, vscodeKindFromNimSym(item.suggest),
                            item.range, item.uri, item.containerName);
                        symbols.push(symbolInfo);
                    }
                });

                resolve(symbols);
            })
            .catch(reason => reject(reason));
    });
}

async function findFile(file: string, timestamp: number): Promise<any> {
    return new Promise<any>((resolve, reject) => {
        dbFiles.findOne({ file: file, timestamp: timestamp }, function (err, doc) { resolve(doc); });
    });
}

async function indexFile(file: string): Promise<void> {
    let timestamp = fs.statSync(file).mtime.getTime();
    let doc = await findFile(file, timestamp);
    if (!doc) {
        // console.log("index: " + file);
        let infos = await getFileSymbols(file, null);
        if (infos && infos.length > 0) {
            dbFiles.remove({ file: file }, { multi: true }, (err, n) => {
                dbFiles.insert({ file: file, timestamp: timestamp });
            });
            dbTypes.remove({ file: file }, { multi: true }, (err, n) => {
                infos.forEach((value) => {
                    dbTypes.insert({
                        ws: vscode.workspace.rootPath,
                        file: value.location.uri.fsPath,
                        range_start: value.location.range.start,
                        range_end: value.location.range.end,
                        type: value.name,
                        container: value.containerName,
                        kind: value.kind
                    });
                });
            });
        }
    }
    return;
}

function vscodeKindFromNimSym(kind: string): vscode.SymbolKind {
    switch (kind) {
        case 'skConst':
            return vscode.SymbolKind.Constant;
        case 'skEnumField':
            return vscode.SymbolKind.Enum;
        case 'skForVar':
            return vscode.SymbolKind.Variable;
        case 'skIterator':
            return vscode.SymbolKind.Array;
        case 'skLabel':
            return vscode.SymbolKind.String;
        case 'skLet':
            return vscode.SymbolKind.Variable;
        case 'skMacro':
            return vscode.SymbolKind.Function;
        case 'skMethod':
            return vscode.SymbolKind.Method;
        case 'skParam':
            return vscode.SymbolKind.Variable;
        case 'skProc':
            return vscode.SymbolKind.Function;
        case 'skResult':
            return vscode.SymbolKind.Function;
        case 'skTemplate':
            return vscode.SymbolKind.Interface;
        case 'skType':
            return vscode.SymbolKind.Class;
        case 'skVar':
            return vscode.SymbolKind.Variable;
    }
    return vscode.SymbolKind.Property;
}

function removeFromIndex(file: string): void {
    dbFiles.remove({ file: file }, { multi: true }, function (err, doc) {
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