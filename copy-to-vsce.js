// We copy files to package and publish because vsce can't working for linked directory.

const fs = require('fs-extra')
const path = require('path')

let fromDir = path.dirname(__filename)
let toDir = path.dirname(__filename) + '/vsce'
let excludeNames = ['.gitignore', '.vscode', '.git', 'packages', 'vsce', 'tsconfig.json', 'src', 'copy-to-vsce.js']

fs.ensureDirSync(toDir)

let fileOrFolderNames = fs.readdirSync(fromDir)
fileOrFolderNames = fileOrFolderNames.filter(v => !excludeNames.includes(v))

for (let fileOrFolderName of fileOrFolderNames) {
	fs.copySync(fromDir + '/' + fileOrFolderName, toDir + '/' + fileOrFolderName, {dereference: true})
}

let text = fs.readFileSync(toDir + '/package.json').toString('utf8')
text = text.repalce(/^.*"vscode:prepublish".+\n/m, '')
fs.writeFileSync(toDir + '/package.json', text)