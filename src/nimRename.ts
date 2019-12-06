'use strict';

import vscode = require('vscode');
import { getDirtyFile } from './nimUtils';
import { execNimSuggest, NimSuggestType } from './nimSuggestExec';

export class NimRenameProvider implements vscode.RenameProvider {

  public provideRenameEdits(document: vscode.TextDocument, position: vscode.Position, newName: string, token: vscode.CancellationToken): Thenable<vscode.WorkspaceEdit> {
    return new Promise<vscode.WorkspaceEdit>((resolve, reject) => {
      vscode.workspace.saveAll(false).then(() => {
          execNimSuggest(NimSuggestType.use, document.fileName, position.line + 1, position.character, getDirtyFile(document))
            .then(result => {
              var references: vscode.WorkspaceEdit = new vscode.WorkspaceEdit();
              if (result) {
                result.forEach(item => {
                  let endPosition = new vscode.Position(item.range.end.line, item.range.end.character + item.symbolName.length);
                  references.replace(item.uri, new vscode.Range(item.range.start, endPosition), newName);
                });
                resolve(references);
              } else {
                resolve();
              }
            })
            .catch(reason => reject(reason));
        });
    });
  }
}
