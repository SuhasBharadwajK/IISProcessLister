const Shell = require('node-powershell');
const http = require('http');
const cmd = require('node-cmd');
const handlebars = require('handlebars');
const fs = require('fs');

// Platform specific and custom constants start
const serverPort = 8097;
const vs2015Port = "8085";
const vs2015Path = "C:\\Program Files (x86)\\Microsoft Visual Studio 14.0\\Common7\\Packages\\Debugger\\X64";
const vs2015DebuggerName = "VS2015 Remote Debugger";
const vs2017Port = "8091";
const vs2017Path = "C:\\Program Files (x86)\\Microsoft Visual Studio\\2017\\Enterprise\\Common7\\IDE\\Remote Debugger\\x64";
const vs2017DebuggerName = "VS2017 Remote Debugger";
// Platform specific and custom constants end

const processIdKey = "ProcessId";
const commandLineKey = "CommandLine";
const nameKey = "Name";
const siteRunningStatus = "Started";
const siteStateKey = "State";
const siteBindingsKey = "Bindings";

// For lack of a better security measure, only css and png content is allowed for now.
const allowedFileTypes = [
    // '.html',
    // '.js',
    '.css', 
    '.png',
    // '.jpeg',
    // '.jpg',
    // '.svg',
    // '.ttf',
    // '.otf',
    // '.woff',
];

var processes = [];
var debuggerProcesses = [];

const server = http.createServer((request, response) => {
    if (request.url === "/") {
        fs.readFile('html/index.html', "utf8", (error, pageContent) => {
            if (!error) {
                getIISProcesses().then((allProcesses) => {
                    response.statusCode = 200;
                    response.setHeader('Content-Type', 'text/html');
                    var template = handlebars.compile(pageContent);
                    var data = {
                        instances: allProcesses.filter(p => !p.isDebuggerProcess),
                        vs2015Debugger: allProcesses.filter(p => p.isDebuggerProcess && p.name == vs2015DebuggerName)[0],
                        vs2017Debugger: allProcesses.filter(p => p.isDebuggerProcess && p.name == vs2017DebuggerName)[0],
                    };
                    
                    var result = template(data);
                    response.end(result);
                }, () => {
                    response.statusCode = 500;
                    response.end();
                });
            }
        });
    }
    // DANGER: This can be misused to access any file of the declared formats.
    else if(allowedFileTypes.some(fileType => request.url.endsWith(fileType))) {
        var filePath = '.' + request.url;
        fs.readFile(filePath, function (error, pageContent) {
            if (error) {
                response.writeHead(404);
                response.write('Contents you are looking are Not Found');
                response.end();
            } else {
                response.writeHead(200);
                response.write(pageContent);
                response.end();
            }
        }); 
    }
});

var getIISProcesses = function () {
    var ps = new Shell({
        executionPolicy: 'Bypass',
        noProfile: true
    });

    ps.addCommand('Get-WmiObject Win32_Process -Filter "name=\'w3wp.exe\'" | Select-Object ProcessId, CommandLine');
    return new Promise((resolve, reject) => {
        ps.invoke()
            .then(output => {
                processes = [];
                var outputLines = output.trim().split('\n');
                if (outputLines.length > 2) {
                    var commands = output.trim().split('\n').slice(2);
                    commands.forEach(command => {
                        var lineComponents = command.split(" ").filter(i => i.length);
                        var name = lineComponents[3].replace(/"/g, "").trim().replace("AppPool", "");
                        var processId = lineComponents[0];
                        if (!processes.some(p => p.name === name)) {
                            processes.push(new Process({
                                pid: processId,
                                name: name,
                                isRunning: true
                            }));
                        }
                    });
                }

                getAllInstances().then((allInstances) => {
                    allInstances.forEach(instance => {
                        if (!processes.some(p => p.name == instance.name)) {
                            processes.push(instance);
                        }
                        else {
                            var index = processes.findIndex(p => p.name == instance.name);
                            processes[index].port = instance.port;
                        }
                    });

                    getDebuggerInstances().then((debuggerProcesses) => {
                        resolve(processes.concat(debuggerProcesses));
                    }, () => {
                        reject();
                    });
                }, () => {
                    reject();
                });
    
    
                ps.dispose();
            }).catch(err => {
                console.log(err);
                ps.dispose();
                reject();
            });
    });
}

var getAllInstances = function() {
    var ps = new Shell({
        executionPolicy: 'Bypass',
        noProfile: true
    });

    ps.addCommand('Get-IISSite | Format-List Name, State, Bindings');
    return new Promise((resolve, reject) => {
        ps.invoke()
        .then(output => {
            var allSites = [];
            var lines = output.trim().split('\n\r').filter(l => l.length);
            lines.forEach(line => {
                var lineJson = jsonify(line);
                var ports = lineJson[siteBindingsKey].match(/\s(80|443|([1-9][0-9]{3,4}))\s/g) || [];
                allSites.push(new Process({
                    name: lineJson[nameKey],
                    isRunning: lineJson[siteStateKey] == siteRunningStatus,
                    port: ports.unique().map(Function.prototype.call, String.prototype.trim).join(', ')
                }));
            });

            ps.dispose();
            resolve(allSites);
        })
        .catch(error => {
            console.log(error);
            ps.dispose();
            reject();
        });
    });
}

var getDebuggerInstances = function () {
    var ps = new Shell({
        executionPolicy: 'Bypass',
        noProfile: true
    });

    ps.addCommand('Get-WmiObject Win32_Process -Filter "name=\'msvsmon.exe\'" | Format-List ProcessId, Name, Path, CommandLine');
    return new Promise((resolve, reject) => {
        ps.invoke()
            .then(output => {
                debuggerProcesses = [];
                var outputLines = output.trim().split('\n\r').filter(l => l.length);
                if (outputLines.length) {
                    outputLines.forEach(line => {
                        if (!line.includes("CHILDSERVER")) {
                            var lineJson = jsonify(line.trim());
    
                            var pid = lineJson[processIdKey];
                            var commandLineElements = lineJson[commandLineKey].split(' ');
                            var port = commandLineElements[commandLineElements.length - 1];
                            var name = port === vs2015Port ? vs2015DebuggerName : vs2017DebuggerName;
                            if (port.trim().length && !debuggerProcesses.some(p => (port === vs2015Port && p.name == vs2015DebuggerName) || (port === vs2017Port && p.name == vs2017DebuggerName))) {
                                debuggerProcesses.push(new Process({
                                    pid: pid,
                                    name: name,
                                    port: port,
                                    isDebuggerProcess: true,
                                    isRunning: true
                                }));
                            }
                        }
                    });
    
                    if (debuggerProcesses.length == 2) {
                        resolve(debuggerProcesses);
                    } else if (debuggerProcesses.length == 1) {
                        if (debuggerProcesses[0].port === vs2017Port) {
                            startDebuggerInstance(vs2015Path, vs2015Port).then(() => {
                                resolve(debuggerProcesses);
                            }, () => {
                                reject();
                            });
                        } else {
                            startDebuggerInstance(vs2017Path, vs2017Port).then(() => {
                                resolve(debuggerProcesses);
                            }, () => {
                                reject();
                            });
                        }
                    }
                } else {
                    startDebuggerInstance(vs2017Path, vs2017Port).then(() => {
                        startDebuggerInstance(vs2015Path, vs2015Port).then(() => {
                            resolve(debuggerProcesses);
                        }, () => {
                            reject();
                        });
                    });
                }
            })
            .catch(error => {
                console.log(error);
                ps.dispose();
                reject();
            })
    });
}

var startDebuggerInstance = function (path, port) {
    var netStatCommand = "netstat -ano | findstr :" + port;

    return new Promise((resolve, reject) => {
        cmd.get(netStatCommand, (error, data, stderr) => {
            if (!data || !data.trim().length) {
                var remoteDebuggerCommand = "\"" + path + "\\msvsmon.exe\" /noauth /anyuser /nosecuritywarn /port " + port;
                cmd.run(remoteDebuggerCommand);
            }
    
            resolve();
        });
    });
}

var jsonify = function (input) {
    var result = {};
    var lines = input.trim().split('\r\n');
    lines.forEach(line => {
        var lineComponents = line.trim().split(':');
        if (lineComponents.length > 1 && lineComponents.every(l => l.trim().length)) {
            var value = lineComponents[1].trim();
            if (lineComponents.length > 2) {
                value = lineComponents.slice(1, lineComponents.length).join(' ');
            }

            result[lineComponents[0].trim()] = value.trim();
        } else if (lineComponents.length == 1) {
            var resultKeys = Object.keys(result);
            var lastKey = resultKeys[resultKeys.length - 1];
            result[lastKey] += ' ' + line.trim();
        }
    });

    return result;
}

server.listen(serverPort, () => {
    console.log("Server is running!");
});

var Process = function (args) {
    this.pid = args && args.pid ? args.pid : "N/A";
    this.name = args ? args.name : null;
    this.path = args ? args.path : null;
    this.port = args ? args.port : null;
    this.isRunning = args ? args.isRunning : false;
    this.isSiteRunning = this.isRunning ? "Yes" : "No";
    this.isWorkerProcessRunning = this.isRunning && this.pid !== "N/A" && this.pid.length ? "Yes" : "No";
    this.isDebuggerProcess = !!args.isDebuggerProcess;
}

Array.prototype.contains = function(v) {
    for(var i = 0; i < this.length; i++) {
        if(this[i] === v) return true;
    }
    return false;
};

Array.prototype.unique = function() {
    var arr = [];
    for(var i = 0; i < this.length; i++) {
        if(!arr.includes(this[i])) {
            arr.push(this[i]);
        }
    }
    return arr; 
}