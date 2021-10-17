/* eslint-disable no-await-in-loop */
import { builtinModules } from 'module'
import { registerExtensionCommand, registerActiveDevelopmentCommand, registerNoop, showQuickPick } from 'vscode-framework'
import vscode from 'vscode'
import { join } from 'path/posix'

// settings: also suggest to install @types/node if package.json has typescript
export const activate = () => {
    vscode.languages.registerCodeActionsProvider(
        { language: 'typescript' },
        {
            provideCodeActions(document, range, context, token) {
                const { diagnostics } = context
                const codeActions: vscode.CodeAction[] = []
                const problem = diagnostics[0]
                if (!problem) return
                const addConstFix = (isPreferred = true) => {
                    const constFix = new vscode.CodeAction('Change to const', vscode.CodeActionKind.QuickFix)
                    constFix.edit = new vscode.WorkspaceEdit()
                    constFix.isPreferred = isPreferred
                    constFix.diagnostics = [problem]
                    constFix.edit.replace(document.uri, problem.range, 'const')
                    codeActions.push(constFix)
                }

                if (problem.code === 2304) {
                    const module = /'(.+)'\.$/.exec(problem.message)?.[1]
                    if (!module) {
                        console.warn("Can't extract name", problem)
                        return
                    }

                    if (module === 'cosnt') addConstFix(false)
                }

                if (problem.code === 1435) addConstFix()

                return codeActions
            },
        },
    )

    // Add missing commas
    registerActiveDevelopmentCommand(async () => {
        const currentEditor = vscode.window.activeTextEditor
        if (currentEditor === undefined) return
        const { document } = currentEditor
        // js
        if (document.isClosed || !['typescript'].includes(document.languageId)) return

        const diagnostics = vscode.languages.getDiagnostics(document.uri)

        if (diagnostics.length === 0) return

        await currentEditor.edit(edit => {
            for (const problem of diagnostics) {
                if (problem.source !== 'ts' || problem.code !== 1005) continue
                // TODO remove and reuse codefix
                if (document.getText(problem.range) === ';') {
                    edit.replace(problem.range, ',')
                } else {
                    const commaPosition = problem.range.start.translate(0, -1)
                    edit.insert(commaPosition, ',')
                }
            }
        })

        // setting: auto-format
        const textEdits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
            'vscode.executeFormatRangeProvider',
            document.uri,
            new vscode.Range(diagnostics[0]!.range.start, diagnostics.slice(-1)[0]!.range.end),
        )
        // perf
        if (textEdits)
            await currentEditor.edit(
                edit => {
                    for (const { range, newText } of textEdits) edit.replace(range, newText)
                },
                {
                    undoStopAfter: false,
                    undoStopBefore: false,
                },
            )
    })

    // default import will be removed from here
    vscode.languages.registerCodeActionsProvider(
        { language: 'typescript' },
        {
            provideCodeActions(document, range, context, token) {
                const { diagnostics } = context
                const codeActions: vscode.CodeAction[] = []
                const problem = diagnostics[0]
                if (!problem) return

                if (problem.code === 2304) {
                    const module = /'(.+)'\.$/.exec(problem.message)?.[1]
                    if (!module) {
                        console.warn("Can't extract module name", problem)
                        return
                    }

                    if (builtinModules.includes(module)) {
                        const fixDefaultImport = new vscode.CodeAction(`Import node module ${module}`, vscode.CodeActionKind.QuickFix)
                        fixDefaultImport.edit = new vscode.WorkspaceEdit()
                        // TODO formatting; commonjs
                        fixDefaultImport.edit.insert(document.uri, new vscode.Position(0, 0), `import ${module} from '${module}'\n`)
                        fixDefaultImport.isPreferred = true
                        fixDefaultImport.diagnostics = [problem]
                        codeActions.push(fixDefaultImport)
                    } else {
                        // const packageJson = vscode.workspace.fs.readFile(join())
                    }
                }

                return codeActions
            },
        },
    )

    // jumpy like fixes
    registerNoop('Pick problems by source', async () => {
        const document = vscode.window.activeTextEditor?.document
        if (document === undefined) return
        // lodash-marker
        const diagnosticsByGroup: Record<string, vscode.Diagnostic[]> = {}
        const diagnostics = vscode.languages.getDiagnostics(document.uri)
        for (const diagnostic of diagnostics) {
            const source = diagnostic.source ?? 'No source'
            if (!diagnosticsByGroup[source]) diagnosticsByGroup[source] = []
            diagnosticsByGroup[source]!.push(diagnostic)
        }

        const selectedSource = await showQuickPick(
            Object.entries(diagnosticsByGroup)
                .sort(([, a], [, b]) => a.length - b.length)
                .map(([source, { length }]) => ({ label: source, description: `${length}`, value: source })),
        )
        if (selectedSource === undefined) return
        // snippet like navigation?
    })
}

// const codeActions: Record<
//     string,
//     {
//         title: string
//         kind: vscode.CodeActionKind
//         actionType: 'edit' // command | openURL
//         action: (
//             ...args: [...Parameters<vscode.CodeActionProvider['provideCodeActions']>, vscode.CodeAction & { edit: vscode.WorkspaceEdit }]
//         ) => vscode.CodeAction
//         /** set to false if computation for fix is heavy. and call only on explicit request (e.g. ctrl+.), only after that bulb will be displayed */
//         // alwaysRegister
//     }
// > = {
//     const: {
//         title: `Change to const`,
//         actionType: 'edit',
//         kind: vscode.CodeActionKind.QuickFix,
//         action(document, range, { diagnostics }, _, codeAction) {
//             const problem = diagnostics[0]!
//         },
//     },
// }

// const getCodeAction = (name: string, ...args: Parameters<vscode.CodeActionProvider['provideCodeActions']>) => {
//     const codeActionData = codeActions[name]!
//     const { title, kind, action } = codeActionData
//     const codeAction = new vscode.CodeAction(title, kind)
//     codeAction.edit = new vscode.WorkspaceEdit()
//     return action(...args, codeAction as any)
// }
