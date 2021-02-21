// We copy files to package and publish because vsce can't work for linked directory.

const fs = require('fs-extra')
const path = require('path')

let fromDir = path.dirname(__filename)
let toDir = path.dirname(__filename) + '/vsce'
let excludeNames = ['.gitignore', '.vscode', '.git', 'packages', 'vsce', 'tsconfig.json', 'src', 'copy-to-vsce.js', 'package-lock.json']

fs.ensureDirSync(toDir)

let fileOrFolderNames = fs.readdirSync(fromDir)
fileOrFolderNames = fileOrFolderNames.filter(v => !excludeNames.includes(v))

for (let fileOrFolderName of fileOrFolderNames) {
	fs.copySync(fromDir + '/' + fileOrFolderName, toDir + '/' + fileOrFolderName, {dereference: true})
}


function repalceText(relativePath, from, to) {
	let text = fs.readFileSync(toDir + '/' + relativePath).toString('utf8')
	text = text.replace(from, to)
	fs.writeFileSync(toDir + '/' + relativePath, text)
}

repalceText('package.json', /^.*"vscode:prepublish".+\n/m, '')
repalceText('node_modules/typescript-flit/out/config.js', 'debugging: true', 'debugging: false')