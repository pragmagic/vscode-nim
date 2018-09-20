/*---------------------------------------------------------
 * Copyright (C) Xored Software Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import { getDirtyFile } from './nimUtils';
import { execNimSuggest, NimSuggestType, NimSuggestResult } from './nimSuggestExec';

export class NimCompletionItemProvider implements vscode.CompletionItemProvider {
  public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionItem[]> {
    return new Promise<vscode.CompletionItem[]>((resolve, reject) => {
      var filename = document.fileName;
      let range = document.getWordRangeAtPosition(position);
      let txt = range ? document.getText(range).toLowerCase() : undefined;
      execNimSuggest(NimSuggestType.sug, filename, (position.line + 1), position.character, getDirtyFile(document))
        .then(items => {
          var suggestions: vscode.CompletionItem[] = [];
          if (items) {
            items.forEach(item => {
              if (item.answerType === 'sug' && (!txt || item.symbolName.toLowerCase().indexOf(txt) >= 0)) {
                var suggestion = new vscode.CompletionItem(item.symbolName);
                suggestion.kind = vscodeKindFromNimSym(item.suggest);
                suggestion.detail = nimSymDetails(item);
                suggestion.sortText = ('0000' + suggestions.length).slice(-4);
                // use predefined text to disable suggest sorting
                suggestion.documentation = item.documentation;
                suggestions.push(suggestion);
              }
            });
          }
          if (suggestions.length > 0) {
            resolve(suggestions);
          } else {
            reject();
          }
        }).catch(reason => reject(reason));
    });
  }
}

function vscodeKindFromNimSym(kind: string): vscode.CompletionItemKind {
  switch (kind) {
    case 'skConst':
      return vscode.CompletionItemKind.Value;
    case 'skEnumField':
      return vscode.CompletionItemKind.Enum;
    case 'skForVar':
      return vscode.CompletionItemKind.Variable;
    case 'skIterator':
      return vscode.CompletionItemKind.Keyword;
    case 'skLabel':
      return vscode.CompletionItemKind.Keyword;
    case 'skLet':
      return vscode.CompletionItemKind.Value;
    case 'skMacro':
      return vscode.CompletionItemKind.Snippet;
    case 'skMethod':
      return vscode.CompletionItemKind.Method;
    case 'skParam':
      return vscode.CompletionItemKind.Variable;
    case 'skProc':
      return vscode.CompletionItemKind.Function;
    case 'skResult':
      return vscode.CompletionItemKind.Value;
    case 'skTemplate':
      return vscode.CompletionItemKind.Snippet;
    case 'skType':
      return vscode.CompletionItemKind.Class;
    case 'skVar':
      return vscode.CompletionItemKind.Field;
    case 'skFunc':
      return vscode.CompletionItemKind.Function;
  }
  return vscode.CompletionItemKind.Property;
}

function nimSymDetails(suggest: NimSuggestResult): string {
  switch (suggest.suggest) {
    case 'skConst':
      return 'const ' + suggest.fullName + ': ' + suggest.type;
    case 'skEnumField':
      return 'enum ' + suggest.type;
    case 'skForVar':
      return 'for var of ' + suggest.type;
    case 'skIterator':
      return suggest.type;
    case 'skLabel':
      return 'label';
    case 'skLet':
      return 'let of ' + suggest.type;
    case 'skMacro':
      return 'macro';
    case 'skMethod':
      return suggest.type;
    case 'skParam':
      return 'param';
    case 'skProc':
      return suggest.type;
    case 'skResult':
      return 'result';
    case 'skTemplate':
      return suggest.type;
    case 'skType':
      return 'type ' + suggest.fullName;
    case 'skVar':
      return 'var of ' + suggest.type;
  }
  return suggest.type;
}
