/*---------------------------------------------------------
 * Copyright (C) Xored Software Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import { getDirtyFile } from './nimUtils'
import { execNimSuggest, INimSuggestResult, NimSuggestType } from './nimSuggestExec'

export class NimDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

  public provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): Thenable<vscode.SymbolInformation[]> {
    return new Promise<vscode.SymbolInformation[]>((resolve, reject) => {
      execNimSuggest(NimSuggestType.outline, document.fileName, 0, 0, getDirtyFile(document))
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
