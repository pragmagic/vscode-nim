/*---------------------------------------------------------
 * Copyright (C) Xored Software Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import { getDirtyFile } from './nimUtils'
import { execNimSuggest, NimSuggestType, INimSuggestResult } from './nimSuggestExec'

export class NimCompletionItemProvider implements vscode.CompletionItemProvider {
  public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionItem[]> {
    return new Promise<vscode.CompletionItem[]>((resolve, reject) => {
      var filename = document.fileName;

      execNimSuggest(NimSuggestType.sug, filename, (position.line + 1), position.character, getDirtyFile(document))
        .then(item => {
          var suggestions = [];

          item.forEach(item => {
            if (item.answerType === "sug") {
              var localSymName = item.name.indexOf('.') > 0 ? item.name.substr(item.name.lastIndexOf('.') + 1) : item.name;
              var suggestion = new vscode.CompletionItem(localSymName);
              suggestion.kind = vscodeKindFromNimSym(item.suggest);
              suggestion.detail = nimSymDetails(item.suggest, item.name, item.type);
              suggestion.documentation = item.documentation;
              suggestions.push(suggestion);
            }
          });
          resolve(suggestions);
        }).catch(reason => reject(reason));
    });
  }
}

function vscodeKindFromNimSym(kind: string): vscode.CompletionItemKind {
  switch (kind) {
    case "skConst":
      return vscode.CompletionItemKind.Reference;
    case "skEnumField":
      return vscode.CompletionItemKind.Enum;
    case "skForVar":
      return vscode.CompletionItemKind.Variable;
    case "skIterator":
      return vscode.CompletionItemKind.Keyword;
    case "skLabel":
      return vscode.CompletionItemKind.Keyword;
    case "skLet":
      return vscode.CompletionItemKind.Field;
    case "skMacro":
      return vscode.CompletionItemKind.Field;
    case "skMethod":
      return vscode.CompletionItemKind.Method;
    case "skParam":
      return vscode.CompletionItemKind.Variable;
    case "skProc":
      return vscode.CompletionItemKind.Method;
    case "skResult":
      return vscode.CompletionItemKind.Variable;
    case "skTemplate":
      return vscode.CompletionItemKind.Keyword;
    case "skType":
      return vscode.CompletionItemKind.Reference;
    case "skVar":
      return vscode.CompletionItemKind.Field;
  }
  return vscode.CompletionItemKind.Property;
}

function nimSymDetails(kind: string, name: string, type: string): string {
  switch (kind) {
    case "skConst":
      return "const " + name + ":" + type;
    case "skEnumField":
      return "enum " + type;
    case "skForVar":
      return "for var";
    case "skIterator":
      return "iterator";
    case "skLabel":
      return "label";
    case "skLet":
      return "let";
    case "skMacro":
      return "macro";
    case "skMethod":
      return "method";
    case "skParam":
      return "param";
    case "skProc":
      return type;
    case "skResult":
      return "result";
    case "skTemplate":
      return "template";
    case "skType":
      return "type " + name;
    case "skVar":
      return "var";
  }
  return type;
}