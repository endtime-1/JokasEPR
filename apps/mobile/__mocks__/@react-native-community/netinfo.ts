let _connected = true;
let _reachable = true;
let _listeners: Array<(state: { isConnected: boolean; isInternetReachable: boolean; type: string }) => void> = [];

function currentState() {
  return {
    isConnected: _connected,
    isInternetReachable: _reachable,
    type: _connected ? "wifi" : "none",
  };
}

const fetch = jest.fn(async () => currentState());

const addEventListener = jest.fn((listener: (state: ReturnType<typeof currentState>) => void) => {
  _listeners.push(listener);
  listener(currentState());
  return () => {
    _listeners = _listeners.filter((l) => l !== listener);
  };
});

function __setOnline(connected: boolean, reachable = connected) {
  _connected = connected;
  _reachable = reachable;
  _listeners.forEach((l) => l(currentState()));
}
function __reset() {
  _connected = true;
  _reachable = true;
  _listeners = [];
}

export { __setOnline, __reset };
export default { addEventListener, fetch, __setOnline, __reset };
