// Stand-ins for VS Code's objects, shared by the tests

/**
 * A webview that records what is posted to it, and the listener it is given
 * @param {Array<object>} [messages] - Where to record what is posted
 * @returns {object} The webview
 */
function recordingWebview(messages = []) {
  return {
    html: "",
    cspSource: "",
    asWebviewUri: (uri) => uri,
    postMessage: async (message) => {
      messages.push(message);
      return true;
    },
    onDidReceiveMessage(listener) {
      this.listener = listener;
      return { dispose: () => {} };
    },
  };
}

module.exports = { recordingWebview };
