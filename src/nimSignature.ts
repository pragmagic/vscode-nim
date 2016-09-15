/*---------------------------------------------------------
 * Copyright (C) Xored Software Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import { getDirtyFile } from './nimUtils'
import { execNimSuggest, NimSuggestResult, NimSuggestType } from './nimSuggestExec'

export class NimSignatureHelpProvider implements vscode.SignatureHelpProvider {

  public provideSignatureHelp(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.SignatureHelp> {
    return new Promise<vscode.SignatureHelp>((resolve, reject) => {
      var filename = document.fileName;

      var currentArgument = 0;
      var identBeforeDot = "";
      {
        var lines = document.getText().split("\n");
        var cursorX = position.character - 1, cursorY = position.line;
        var line = lines[cursorY];
        var bracketsWithin = 0;
        while (line[cursorX] != "(" || bracketsWithin != 0) {
          if ((line[cursorX] == "," || line[cursorX] == ";") && bracketsWithin == 0)
            currentArgument++;
          else if (line[cursorX] == ")")
            bracketsWithin++;
          else if (line[cursorX] == "(")
            bracketsWithin--;

          cursorX--;

          if (cursorX < 0) {
            if (cursorY - 1 < 0) {
              resolve(null);
              return;
            }
            line = lines[--cursorY];
          }
        }

        var dotPosition = -1, start = -1;
        while (cursorX >= 0) {
          if (line[cursorX] == ".") {
            dotPosition = cursorX;
            break;
          }
          cursorX--;
        }

        while (cursorX >= 0 && dotPosition != -1) {
          if (line[cursorX].search("[ \t\({=]") != -1) {
            start = cursorX + 1;
            break;
          }
          cursorX--;
        }

        if (start == -1)
          start = 0;

        if (start != -1) {
          identBeforeDot = line.substring(start, dotPosition);
        }
      }

      execNimSuggest(NimSuggestType.con, filename, position.line + 1, position.character - 1, getDirtyFile(document))
        .then(items => {
          var signatures = new vscode.SignatureHelp();
          var isModule = 0;
          if (items.length > 0)
            signatures.activeSignature = 0;

          items.forEach(item => {
            var signature = new vscode.SignatureInformation(item.type, item.documentation);

            var genericsCleanType = "";
            {
              var insideGeneric = 0;
              for (var i = 0; i < item.type.length; i++) {
                if (item.type[i] == "[")
                  insideGeneric++;
                if (!insideGeneric)
                  genericsCleanType += item.type[i];
                if (item.type[i] == "]")
                  insideGeneric--;
              }
            }

            var signatureCutDown = /(proc|macro|template) \((.+: .+)*\)/.exec(genericsCleanType);
            var parameters = signatureCutDown[2].split(", ");
            parameters.forEach(parameter => {
              signature.parameters.push(new vscode.ParameterInformation(parameter));
            });

            if (item.names[0] == identBeforeDot || item.path.search("/" + identBeforeDot + "/") != -1 || item.path.search("\\\\" + identBeforeDot + "\\\\") != -1)
              isModule++;

            signatures.signatures.push(signature);
          });

          signatures.activeParameter = isModule > 0 || identBeforeDot == "" ? currentArgument : currentArgument + 1;

          resolve(signatures);
        }).catch(reason => reject(reason));
    });
  }
}
