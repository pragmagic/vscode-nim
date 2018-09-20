/*---------------------------------------------------------
 * Copyright (C) Xored Software Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import { NIM_MODE } from './nimMode';
import { getDirtyFile } from './nimUtils';
import { execNimSuggest, NimSuggestType, NimSuggestResult } from './nimSuggestExec';


export class NimHoverProvider implements vscode.HoverProvider {

  public provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Hover> {
    return new Promise<vscode.Hover>((resolve, reject) => {
      execNimSuggest(NimSuggestType.def, document.fileName, position.line + 1, position.character,
        getDirtyFile(document)).then(result => {
          if (result && result.length > 0) {
            let def = result.pop() as NimSuggestResult;

            let label = def.fullName;
            if (def.type !== '')
              label += ': ' + def.type;
            let hoverLabel = { language: NIM_MODE.language as string, value: label };
            if (def.documentation !== '') {
              resolve(new vscode.Hover([hoverLabel, def.documentation], def.range));
            } else {
              resolve(new vscode.Hover(hoverLabel, def.range));
            }
          } else {
            resolve();
          }
        }).catch(reason => reject(reason));
    });
  }

}