# IISProcessLister
This is a simple NodeJS application that lists uses Powershell and CMD on a Windows server to list the running the IIS Worker Process instances with their process IDs, port numbers and names. This also starts the remote debuggers for VS2015 and VS2017, if they are installed.

# Warning!
This should **NOT** be used on a public server. **NEVER**. 
The script needs to be run with administrator privileges and will trigger remote debuggers which allow any remote user to attach to any process **WITHOUT** authentication.
This is extremely dangerous and should not be in a publicly accessible server. This is meant only for private intranet use.

## Usage:
- Before running the script, change the following constants between lines 7 and 15 as per your requirement:
  1. `serverPort`: The port on which the Node server runs. The default one is `8097`. Change this if you want to run it on a different port.
  2. `vs2015Port`: The port on which the remote debugger for VS2015 runs. The default one is `8085`.
  3. `vs2015Path`: The path to the VS2015 remote debugger. This path might differ based on your machine's architecture and the type of installer used.
  4. `vs2015DebuggerName`: The name with which you want to give to the VS2015 remote debugger. 
  5. `vs2017Port`: The port on which the remote debugger for VS2017 runs. The default one is `8091`.
  6. `vs2017Path`: The path to the VS2017 remote debugger. This path might differ based on your machine's architecture and the type of installer used.
  7. `vs2017DebuggerName`: The name with which you want to give to the VS2017 remote debugger. 
- Run `npm install` in the root directory of the repo where `package.json` is located.
- Do `node index.js` from an elevated shell to run the script and start the server. It's important to have the shell privileged since many of the commands depend on it.
The server now listens on port `8097` on your PC, unless you've changed it.
- Open the server's root in a browser and you should see the list of IIS sites on your machine, and the port numbers on which the remote debuggers are listening.
- If the debuggers aren't running or if they have timed out and closed themselves, just refreshing the page will start them again.

This is helpful for remote debugging when not everyone in the development team has access to the remote server but develop and deploy sites to it.
And, like I've already mentioned above, **this is meant for private intranet use only**.
