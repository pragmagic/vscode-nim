/*---------------------------------------------------------
 * Copyright (C) Xored Software Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import { getDirtyFile } from './nimUtils'
import { execNimSuggest, INimSuggestResult, NimSuggestType } from './nimSuggestExec'
import { getNormalizedWorkspacePath } from './nimIndexer'


export class NimReferenceProvider implements vscode.ReferenceProvider {

  public provideReferences(document: vscode.TextDocument, position: vscode.Position, options: { includeDeclaration: boolean }, token: vscode.CancellationToken): Thenable<vscode.Location[]> {
    return vscode.workspace.saveAll(false).then(() => {
      return new Promise((resolve, reject) => {
        execNimSuggest(NimSuggestType.use, document.fileName, position.line + 1, position.character, getDirtyFile(document))
          .then(result => {
            var references = [];
            result.forEach(item => {
              references.push(new vscode.Location(vscode.Uri.file(getNormalizedWorkspacePath(item.path)),
                new vscode.Position(item.line - 1, item.column)));
            })
            resolve(references);
          })
          .catch(reason => reject(reason));
      });
    });
  }
}